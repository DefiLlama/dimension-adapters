import { httpGet } from "../../utils/fetchURL";
import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

// Project X is a Uniswap-V3-style AMM on Hyperliquid L1. Its pools endpoint
// returns a per-pool rolling 24h `volume24h` in USD (the summed `tvlUSD`
// reconciles with the DefiLlama TVL). The host needs a browser User-Agent.
const POOLS_URL = "https://api.prjx.com/pools";
const HEADERS = { "User-Agent": "Mozilla/5.0" };
const PAGE_LIMIT = 100; // API caps a page at 100

interface Pool {
  volume24h: string;
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

const fetch = async () => {
  const dailyVolume = (await fetchAllPools()).reduce((acc, pool) => {
    const volume = Number(pool.volume24h);
    if (!Number.isFinite(volume)) throw new Error(`Project X: invalid volume24h ${pool.volume24h}`);
    return acc + volume;
  }, 0);
  return { dailyVolume };
};

const methodology = {
  Volume: "Sum of the trailing-24h swap volume across Project X's pools (per-pool volume24h, USD), from the Project X pools API.",
};

const adapter: SimpleAdapter = {
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
