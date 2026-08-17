import { PromisePool } from "@supercharge/promise-pool";
import { httpGet } from "../utils/fetchURL";

// Project X is a Uniswap-V3-style AMM on Hyperliquid L1. Its pools endpoint
// returns per-pool rolling-24h `volume24h` and `fee24h` in USD (the summed
// `tvlUSD` reconciles with the DefiLlama TVL). The host needs a browser
// User-Agent. Shared by dexs/prjx and fees/prjx.
const POOLS_URL = "https://api.prjx.com/pools";
const HEADERS = { "User-Agent": "Mozilla/5.0" };
const PAGE_LIMIT = 100; // API caps a page at 100
const PAGE_CONCURRENCY = 5; // parallel page requests after the first

export interface PrjxPool {
  volume24h: string;
  fee24h: string;
}

interface PoolsResponse {
  pools: PrjxPool[];
  totalCount: number;
}

const fetchPage = async (offset: number): Promise<PrjxPool[]> => {
  const res: PoolsResponse = await httpGet(`${POOLS_URL}?limit=${PAGE_LIMIT}&offset=${offset}`, {
    headers: HEADERS,
  });
  if (!Array.isArray(res?.pools)) throw new Error("Project X: pools unavailable");
  return res.pools;
};

/**
 * Fetch every Project X pool. Reads page 1 to learn `totalCount`, then pulls the
 * remaining pages concurrently. Fails closed on a missing/invalid `totalCount`
 * or a short result rather than silently under-reporting.
 *
 * @returns All pools, each with its rolling-24h `volume24h` and `fee24h` (USD).
 */
export async function fetchProjectXPools(): Promise<PrjxPool[]> {
  const first: PoolsResponse = await httpGet(`${POOLS_URL}?limit=${PAGE_LIMIT}&offset=0`, { headers: HEADERS });
  if (!Array.isArray(first?.pools)) throw new Error("Project X: pools unavailable");

  const total = Number(first.totalCount);
  if (!Number.isSafeInteger(total) || total < 0) {
    throw new Error(`Project X: invalid totalCount ${first.totalCount}`);
  }

  const offsets: number[] = [];
  for (let offset = PAGE_LIMIT; offset < total; offset += PAGE_LIMIT) offsets.push(offset);
  const { results, errors } = await PromisePool.withConcurrency(PAGE_CONCURRENCY).for(offsets).process(fetchPage);
  if (errors.length) throw new Error(`Project X: ${errors.length} pools page request(s) failed`);

  const pools = [...first.pools, ...results.flat()];
  if (pools.length < total) {
    throw new Error(`Project X: expected ${total} pools, got ${pools.length}`);
  }
  return pools;
}
