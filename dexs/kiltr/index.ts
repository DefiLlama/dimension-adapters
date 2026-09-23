// DefiLlama dimension-adapters: volume + fees for Kiltr from the public Goldsky subgraph daily snapshots.
// Target path in DefiLlama/dimension-adapters: dexs/kiltr/index.ts (register the same adapter under fees/kiltr/index.ts).
// Volume is recorded on both the in and out token by the subgraph -> halved here. Fees are in-token only.
// Revenue split: protocol share (read live from Kiltr /api/fees, v2 pools) vs LP share = 1 - protocol share.
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet, httpPost } from "../../utils/fetchURL";

const SUBGRAPH = "https://api.goldsky.com/api/public/project_cmu8ptbvnb5gu01q12yzbaauu/subgraphs/kiltr/1.0.1/gn";
const KILTR_API = "https://kiltr.net/api";
const ROBINHOOD_CHAIN = CHAIN.ROBINHOOD;

const QUERY = (from: number, to: number) => `{
  poolSnapshots(first: 1000, where: { period: "day", timestamp_gte: ${from}, timestamp_lt: ${to} }) {
    pool { id version } tokens volumeByToken feesByToken
  } }`;

export async function computeDaily(snapshots: any[], priceOf: (token: string) => { price: number; decimals: number } | undefined, protocolSharePctByVersion: Record<string, number>) {
  let volume = 0, fees = 0, revenue = 0;
  for (const s of snapshots) {
    s.tokens.forEach((t: string, i: number) => {
      const p = priceOf(t.toLowerCase());
      if (!p) return;
      const vol = (Number(s.volumeByToken[i]) / 10 ** p.decimals) * p.price / 2;
      const fee = (Number(s.feesByToken[i]) / 10 ** p.decimals) * p.price;
      volume += vol; fees += fee;
      revenue += fee * ((protocolSharePctByVersion[String(s.pool.version)] ?? 0) / 100);
    });
  }
  return { dailyVolume: volume, dailyFees: fees, dailyRevenue: revenue, dailySupplySideRevenue: fees - revenue };
}

const fetch = async (options: FetchOptions) => {
  const { startTimestamp, endTimestamp, createBalances } = options;
  const data = (await httpPost(SUBGRAPH, { query: QUERY(startTimestamp, endTimestamp) })).data;
  const feesApi = await httpGet(`${KILTR_API}/fees`).catch(() => ({}));
  const share = { "2": feesApi?.v2?.protocolSwapFeeSharePct ?? 0, "3": feesApi?.v3?.protocolSwapFeeSharePct ?? 0 };
  const dailyVolume = createBalances(), dailyFees = createBalances(), dailyRevenue = createBalances(), dailySupplySideRevenue = createBalances();
  for (const s of data.poolSnapshots) {
    s.tokens.forEach((t: string, i: number) => {
      dailyVolume.add(t, BigInt(s.volumeByToken[i]) / 2n);
      const fee = BigInt(s.feesByToken[i]);
      const rev = (fee * BigInt(Math.round((share[String(s.pool.version)] ?? 0) * 100))) / 10000n;
      dailyFees.add(t, fee); dailyRevenue.add(t, rev); dailySupplySideRevenue.add(t, fee - rev);
    });
  }
  return { dailyVolume, dailyFees, dailyRevenue, dailySupplySideRevenue };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: { [ROBINHOOD_CHAIN]: { fetch, start: "2026-09-19" } },
  methodology: {
    Volume: "Sum of swap amounts through Kiltr pools (subgraph daily snapshots; each swap counted once).",
    Fees: "Pool swap fees paid by traders (pool-level swapFee × amount in).",
    Revenue: "Protocol share of swap fees (ProtocolFeesCollector / ProtocolFeeController percentage read live from kiltr.net/api/fees).",
    SupplySideRevenue: "Swap fees remaining with liquidity providers (Fees − Revenue).",
  },
};
export default adapter;
