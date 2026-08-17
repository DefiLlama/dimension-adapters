import { httpGet } from "../../utils/fetchURL";
import { FetchResultV2, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

// Project X is a Uniswap-V3-style AMM on Hyperliquid L1. Its pools endpoint
// returns a per-pool rolling 24h `fee24h` in USD (the summed `tvlUSD` reconciles
// with the DefiLlama TVL). The host needs a browser User-Agent.
const POOLS_URL = "https://api.prjx.com/pools";
const HEADERS = { "User-Agent": "Mozilla/5.0" };
const PAGE_LIMIT = 100; // API caps a page at 100

interface Pool {
  fee24h: string;
}

interface PoolsResponse {
  pools: Pool[];
  totalCount: number;
}

// The endpoint pages by offset/limit (max 100), so walk offsets up to totalCount.
const fetchAllPools = async (): Promise<Pool[]> => {
  const first: PoolsResponse = await httpGet(`${POOLS_URL}?limit=${PAGE_LIMIT}&offset=0`, { headers: HEADERS });
  if (!Array.isArray(first?.pools)) throw new Error("Project X: pools unavailable");
  const pools = [...first.pools];
  const total = Number(first.totalCount);
  for (let offset = PAGE_LIMIT; offset < total; offset += PAGE_LIMIT) {
    const page: PoolsResponse = await httpGet(`${POOLS_URL}?limit=${PAGE_LIMIT}&offset=${offset}`, {
      headers: HEADERS,
    });
    if (!Array.isArray(page?.pools)) throw new Error("Project X: pools page unavailable");
    pools.push(...page.pools);
  }
  return pools;
};

const fetch = async (): Promise<FetchResultV2> => {
  const dailyFees = (await fetchAllPools()).reduce((acc, pool) => {
    const fee = Number(pool.fee24h);
    if (!Number.isFinite(fee)) throw new Error(`Project X: invalid fee24h ${pool.fee24h}`);
    return acc + fee;
  }, 0);
  // A Uniswap-V3-style AMM: the swap fee is paid by traders and accrues to the
  // liquidity providers, so the same figure is user fees and supply-side revenue.
  return { dailyFees, dailyUserFees: dailyFees, dailySupplySideRevenue: dailyFees };
};

const methodology = {
  Fees: "Sum of the trailing-24h swap fees across Project X's pools (per-pool fee24h, USD), from the Project X pools API.",
  UserFees: "Swap fees paid by traders.",
  SupplySideRevenue: "All swap fees accrue to the liquidity providers.",
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.HYPERLIQUID]: {
      fetch,
      // The API exposes only a rolling 24h snapshot, so run at current time.
      runAtCurrTime: true,
      start: '2025-07-08',
    },
  },
  methodology,
};

export default adapter;
