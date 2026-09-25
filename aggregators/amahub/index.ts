import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";

// amahub (https://amahub.ama.one) — an agent platform on the Amadeus protocol
// where users and their agents execute swaps and DCA/limit orders through
// routing venues (ParaSwap, best-swap, Uniswap, LI.FI, KyberSwap, CoW, …) on
// Ethereum, Base, Arbitrum, Optimism, BNB, Polygon, Avalanche, Linea, Scroll,
// Katana, Robinhood Chain, Monad, HyperEVM and Solana. The platform publishes
// its executed value day by day (Executed Agent Value, EAV): the USD value of
// successful, verified executions at the price frozen at execution time, each
// execution counted once. Failed, reverted and unverified executions are
// excluded. The figure is platform-wide, not per chain, so it is reported
// under CHAIN_GLOBAL rather than summed from per-chain parts that do not exist.
const ENDPOINT = "https://amahub.ama.one/api/metrics-public-daily";

const day = (ts: number) => new Date(ts * 1000).toISOString().slice(0, 10);

const fetch = async (options: FetchOptions) => {
  const d = day(options.startOfDay);
  const res = await httpGet(`${ENDPOINT}?from=${d}&to=${d}`);
  const row = (res?.days || []).find((r: any) => r.day === d);
  if (!row) throw new Error(`amahub: no row for ${d}`);
  if (row.eav_usd === null || row.eav_usd === undefined) throw new Error(`amahub: ${d} has no executed value recorded`);
  if (row.eav_basis !== "rows") throw new Error(`amahub: ${d} is not on the exact per-row basis (${row.eav_basis})`);
  return {
    dailyVolume: row.eav_usd,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.CHAIN_GLOBAL]: {
      fetch,
      start: "2026-08-11",
    },
  },
  methodology: {
    Volume:
      "Executed Agent Value: the USD value of successful, verified swap and order executions routed through amahub by users and their agents, priced at execution time and counted once per execution, as published by amahub's public daily metrics endpoint. Failed, reverted and unverified executions are excluded. Platform-wide across all supported chains.",
  },
};

export default adapter;
