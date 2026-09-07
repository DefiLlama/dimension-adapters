import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { request, gql } from "graphql-request";
import PromisePool from "@supercharge/promise-pool";

// Hypersurface Protocol - DeFi Structured Products Platform
// Website: https://hypersurface.io
// Twitter: https://x.com/hypersurfaceX
// Category: Options

// Breakdown labels, one per collateral pool.
const USDT0_POOL = "USDT0-collateral pool";
const USDC_POOL = "USDC-collateral pool";

// Subgraph endpoints (same as the protocol's analytics dashboard uses).
interface Pool {
  label: string;
  url: string;
}

const SUBGRAPH = (name: string) =>
  `https://api.goldsky.com/api/public/project_clysuc3c7f21y01ub6hd66nmp/subgraphs/${name}/latest/gn`;

// One entry per chain, holding both the adapter config and the pools to query.
// Each collateral pool is indexed by its own subgraph, so a chain can have
// several: HyperEVM runs a USDT0-collateral pool and a USDC-collateral pool
// side by side, and both must be summed to get the chain's real volume.
// The label is carried through to the returned balances so the per-pool
// breakdown can be populated.
const chainConfig: { [chain: string]: { start: string; pools: Pool[] } } = {
  [CHAIN.HYPERLIQUID]: {
    start: "2025-09-16", // First trade on HyperEVM
    pools: [
      { label: USDT0_POOL, url: SUBGRAPH("hypersurface-sh-subgraph") },
      { label: USDC_POOL, url: SUBGRAPH("hypersurface-usdc-subgraph") },
    ],
  },
  [CHAIN.BASE]: {
    start: "2025-10-01", // First trade on Base
    pools: [{ label: USDC_POOL, url: SUBGRAPH("hypersurface-base-subgraph") }],
  },
};

// GraphQL query to fetch trades within a time range
// The subgraph calculates and stores totalNotionalUSD directly
const TRADES_QUERY = gql`
  query getTrades($startTimestamp: BigInt!, $endTimestamp: BigInt!, $skip: Int!) {
    trades(
      first: 1000
      skip: $skip
      orderBy: createdTimestamp
      orderDirection: asc
      where: { createdTimestamp_gte: $startTimestamp, createdTimestamp_lt: $endTimestamp }
    ) {
      id
      createdTimestamp
      totalPremium
      totalNotionalUSD
    }
  }
`;

interface Trade {
  id: string;
  createdTimestamp: string;
  totalPremium: string;
  totalNotionalUSD: string;
}

// The subgraphs are served by Goldsky, whose shared rate limit resets every
// ten seconds. Retry with backoff so a burst does not fail the whole run.
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function requestWithRetry(
  subgraphUrl: string,
  variables: Record<string, string | number>,
  attempts = 5
): Promise<{ trades: Trade[] }> {
  let lastError: any;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await request<{ trades: Trade[] }>(
        subgraphUrl,
        TRADES_QUERY,
        variables
      );
    } catch (error: any) {
      lastError = error;
      const isRateLimited = String(error?.message ?? "").includes("429");
      if (!isRateLimited && attempt > 0) break;
      if (attempt === attempts - 1) break; // no point sleeping before throwing
      await sleep(2000 * (attempt + 1));
    }
  }
  throw lastError;
}

// Fetch all trades in the time range with pagination
async function fetchAllTrades(
  subgraphUrl: string,
  startTimestamp: number,
  endTimestamp: number
): Promise<Trade[]> {
  const allTrades: Trade[] = [];
  let skip = 0;
  const batchSize = 1000;

  while (true) {
    const response = await requestWithRetry(subgraphUrl, {
      startTimestamp: startTimestamp.toString(),
      endTimestamp: endTimestamp.toString(),
      skip,
    });

    if (!response.trades || response.trades.length === 0) {
      break;
    }

    allTrades.push(...response.trades);

    if (response.trades.length < batchSize) {
      break;
    }

    skip += batchSize;
  }

  return allTrades;
}

const fetch = async (options: FetchOptions) => {
  const config = chainConfig[options.chain];
  if (!config) {
    throw new Error(`No subgraph URL found for chain: ${options.chain}`);
  }
  const { pools } = config;

  // Use the v2 fetch window so the adapter is correct for any run length,
  // including hourly runs. The range is half-open, so consecutive windows
  // never double count a trade.
  const { startTimestamp, endTimestamp } = options;

  const dailyNotionalVolume = options.createBalances();
  const dailyPremiumVolume = options.createBalances();

  // The pools share one Goldsky project and therefore one rate limit, so they
  // are queried one at a time rather than concurrently.
  // Every pool on the chain is required to compute that chain's total, so a
  // pool that cannot be read is fatal for the chain rather than skipped.
  // Skipping one would publish a silently understated volume as if it were the
  // real figure; throwing leaves no datapoint, which is visible and refillable.
  // requestWithRetry already absorbs transient rate limits, so a failure here
  // is a sustained outage.
  const { results, errors } = await PromisePool.withConcurrency(1)
    .for(pools)
    .process(async (pool) => ({
      label: pool.label,
      trades: await fetchAllTrades(pool.url, startTimestamp, endTimestamp),
    }));

  if (errors.length) {
    throw errors[0].raw ?? errors[0];
  }

  results.forEach(({ trades }) => {
    for (const trade of trades) {
      // Premium is stored in the pool's collateral decimals.
      // Every collateral in use (USDT0, USDC) is 6 decimals and dollar pegged.
      dailyPremiumVolume.addUSDValue(Number(trade.totalPremium) / 1e6);

      // totalNotionalUSD is pre-calculated in the subgraph as:
      // (totalNotional x underlyingPrice) / 1e16
      // The division already happened in the subgraph, so this value is in whole USD
      dailyNotionalVolume.addUSDValue(Number(trade.totalNotionalUSD));
    }
  });

  return {
    dailyNotionalVolume,
    dailyPremiumVolume,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  adapter: chainConfig, // start dates and pools are read from chainConfig per chain
  methodology: {
    NotionalVolume:
      "Sum of the notional value (in USD) of all options traded on the protocol during the period, across every collateral pool on the chain. Calculated as sum of |leg.amount| x oracle_price_at_trade_time for each trade leg.",
    PremiumVolume:
      "Sum of all premiums paid for options traded on the protocol during the period, across every collateral pool on the chain.",
  },
};

export default adapter;
