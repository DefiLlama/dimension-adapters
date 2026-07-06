import { CHAIN } from "../../helpers/chains";
import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { queryDuneSql } from "../../helpers/dune";

// DeFa — daily USDC inflow (capital raised) into invoice-backed real-world-credit pools.
// The on-chain TVL loggers expose a cumulative "raised" figure per chain; a daily job
// snapshots them into Dune (dune.defa_im.raised_daily: date, chain, raised_usd).
// Here we take the day-over-day increase = that day's inflow. DefiLlama accumulates it
// into cumulative volume, which is monotonic (never decreases) — the "total raised".
//
// First tracked day has no prior row, so it reports the full cumulative-to-date, making
// the accumulated total equal actual total raised.

const prefetch = async (options: FetchOptions) => {
  // Dune needs DUNE_API_KEYS, which fork-PR CI doesn't provide; skip there so the
  // test doesn't false-fail (production always has the key). Logged so it's not silent.
  if (!process.env.DUNE_API_KEYS) {
    console.error("DeFa volume: DUNE_API_KEYS not set — skipping Dune query (expected only in fork-PR CI; production has the key)");
    return [];
  }
  const query = `
    WITH daily AS (
      SELECT chain, date, MAX(raised_usd) AS raised_usd     -- dedup re-runs: latest per day
      FROM dune.defa_im.raised_daily
      GROUP BY chain, date
    ),
    delta AS (
      SELECT chain, date,
             COALESCE(raised_usd - LAG(raised_usd) OVER (PARTITION BY chain ORDER BY date), raised_usd) AS daily_raised
      FROM daily
    )
    SELECT chain, COALESCE(SUM(daily_raised), 0) AS daily_raised
    FROM delta
    -- 'date' is a unix-seconds bigint (not a SQL DATE), so compare directly to the unix bounds
    WHERE date >= ${options.startTimestamp} AND date < ${options.endTimestamp}
    GROUP BY chain
  `;
  return queryDuneSql(options, query);
};

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const rows: { chain: string; daily_raised: number }[] = options.preFetchedResults || [];
  const row = rows.find((r) => r.chain === options.chain);
  if (!row) {
    if (!process.env.DUNE_API_KEYS) return { dailyVolume }; // no Dune key in fork CI → skip
    throw new Error(`No row found for chain ${options.chain}`);
  }
  dailyVolume.addUSDValue(Number(row.daily_raised));
  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 1,
  prefetch,
  fetch,
  chains: [CHAIN.ETHEREUM, CHAIN.STELLAR, CHAIN.STARKNET, "zigchain"],
  start: "2026-07-04",
  dependencies: [Dependencies.DUNE],
  isExpensiveAdapter: true,
  methodology: {
    Volume:
      "Daily USDC inflow (capital deployed) into DeFa's real-world-credit pools: invoice financing on Stellar, ZigChain and Starknet (from on-chain TVL loggers), plus PSP/PayFi lending on Ethereum (USDC inflow into the DeFa PayFi layer). Snapshotted daily to Dune (dune.defa_im.raised_daily) and reported as the day-over-day increase in cumulative inflow; the accumulated total equals total capital deployed and is monotonic (never decreases).",
  },
};

export default adapter;
