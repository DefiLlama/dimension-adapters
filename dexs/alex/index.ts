import { postURL } from "../../utils/fetchURL"
import { SimpleAdapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const V2_GQL = "https://gql-v2.alexlab.co/v1/graphql";
const V1_GQL = "https://gql.alexlab.co/v1/graphql";

const V2_DAILY_START = 1720224000; // 2024-07-06
const V1_1_START = 1683072000;     // 2023-05-03

function startOfDayUTC(timestamp: number): number {
  const d = new Date(timestamp * 1000);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) / 1000;
}

// 2024-07-06+: daily aggregates, volume in USD * 1e18
async function fetchV2Daily(dayStart: number): Promise<number> {
  const gte = new Date(dayStart * 1000).toISOString();
  const lt = new Date((dayStart + 86400) * 1000).toISOString();
  const res = await postURL(V2_GQL, {
    query: `{
      sink_mart_amm_pool_v2_1_volume_by_pool_1d(
        where: { date: { _gte: "${gte}", _lt: "${lt}" } }
      ) { volume }
    }`,
  });
  const rows: { volume: string }[] = res.data.sink_mart_amm_pool_v2_1_volume_by_pool_1d;
  return rows.reduce((s, r) => s + Number(r.volume), 0) / 1e18;
}

// 2023-05-03 to 2024-05-18: per-block snapshots, volume_24h in USD * 1e18
// Take the last snapshot per pool within the day and sum.
async function fetchV1_1(dayStart: number): Promise<number> {
  const dayEnd = dayStart + 86400;
  const res = await postURL(V2_GQL, {
    query: `{
      amm_swap_pool_stats_v1_1(
        where: { burn_block_time: { _gte: ${dayStart}, _lt: ${dayEnd} } }
      ) { burn_block_time pool_id volume_24h }
    }`,
  });
  const rows: Array<{ burn_block_time: number; pool_id: number; volume_24h: string }> =
    res.data.amm_swap_pool_stats_v1_1;
  const lastVol: Record<number, { ts: number; vol: number }> = {};
  for (const r of rows) {
    const entry = lastVol[r.pool_id];
    if (!entry || r.burn_block_time > entry.ts)
      lastVol[r.pool_id] = { ts: r.burn_block_time, vol: Number(r.volume_24h) };
  }
  return Object.values(lastVol).reduce((s, e) => s + e.vol, 0) / 1e18;
}

// 2022-01-23 to 2023-05-03: laplace_pool_stats with price conversion.
// volume_x_24h is in token_x units * 1e8; multiply by USD price.
async function fetchLegacy(dayStart: number): Promise<number> {
  const dayEnd = dayStart + 86400;
  const statsRes = await postURL(V1_GQL, {
    query: `{
      laplace_pool_stats(
        where: { burn_block_time: { _gte: ${dayStart}, _lt: ${dayEnd} } }
      ) { burn_block_time pool_token token_x volume_x_24h }
    }`,
  });
  const stats: Array<{
    burn_block_time: number;
    pool_token: string;
    token_x: string;
    volume_x_24h: string;
  }> = statsRes.data.laplace_pool_stats;

  if (!stats.length) return 0;

  const lastSnap: Record<string, (typeof stats)[0]> = {};
  for (const r of stats) {
    const cur = lastSnap[r.pool_token];
    if (!cur || r.burn_block_time > cur.burn_block_time) lastSnap[r.pool_token] = r;
  }

  const tokenNames = [
    ...new Set(Object.values(lastSnap).map((s) => s.token_x.split(".").pop()!)),
  ];

  const buildPriceQuery = (gte: number, lt: number) => `{
    laplace_history_price_v2(
      where: {
        burn_block_time: { _gte: ${gte}, _lt: ${lt} }
        token: { _in: ${JSON.stringify(tokenNames)} }
      }
      order_by: { burn_block_time: desc }
    ) { token avg_price_usd }
  }`;

  const priceRows: Array<{ token: string; avg_price_usd: number }> =
    (await postURL(V1_GQL, { query: buildPriceQuery(dayStart, dayEnd) }))
      .data.laplace_history_price_v2;

  const prices: Record<string, number> = {};
  for (const r of priceRows) {
    if (!(r.token in prices)) prices[r.token] = Number(r.avg_price_usd);
  }

  const missingTokens = tokenNames.filter((token) => !(token in prices));
  if (missingTokens.length) {
    const backfillRows: Array<{ token: string; avg_price_usd: number }> = (
      await postURL(V1_GQL, {
        query: `{
          laplace_history_price_v2(
            where: {
              burn_block_time: { _gte: ${dayStart - 7 * 86400}, _lt: ${dayEnd} }
              token: { _in: ${JSON.stringify(missingTokens)} }
            }
            order_by: { burn_block_time: desc }
          ) { token avg_price_usd }
        }`,
      })
    ).data.laplace_history_price_v2;

    for (const r of backfillRows) {
      if (!(r.token in prices)) prices[r.token] = Number(r.avg_price_usd);
    }
  }

  const unresolvedTokens = tokenNames.filter((token) => !(token in prices));
  if (unresolvedTokens.length) {
    console.error(`ALEX legacy prices missing for ${dayStart}: ${unresolvedTokens.join(",")}`);
    return 0;
  }

  let totalUSD = 0;
  for (const snap of Object.values(lastSnap)) {
    const tokenName = snap.token_x.split(".").pop()!;
    totalUSD += (Number(snap.volume_x_24h) / 1e8) * (prices[tokenName] ?? 0);
  }
  return totalUSD;
}

const fetch = async (options: FetchOptions) => {
  const dayStart = startOfDayUTC(options.toTimestamp);

  let dailyVolume: number;
  if (dayStart >= V2_DAILY_START) {
    dailyVolume = await fetchV2Daily(dayStart);
  } else if (dayStart >= V1_1_START) {
    dailyVolume = await fetchV1_1(dayStart);
  } else {
    dailyVolume = await fetchLegacy(dayStart);
  }

  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.STACKS]: {
      fetch,
      start: "2022-01-23",
    },
  },
};

export default adapter;
