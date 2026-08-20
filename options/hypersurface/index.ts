import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { request, gql } from "graphql-request";

// Hypersurface Protocol - DeFi Structured Products Platform
// Website: https://hypersurface.io
// Twitter: https://x.com/hypersurfaceX
// Category: Options

// Subgraph endpoints (same as the protocol's analytics dashboard uses).
// Each collateral pool is indexed by its own subgraph, so a chain can have
// several: HyperEVM runs a USDT0-collateral pool and a USDC-collateral pool
// side by side, and both must be summed to get the chain's real volume.
const SUBGRAPH_URLS: { [chain: string]: string[] } = {
  [CHAIN.HYPERLIQUID]: [
    // USDT0-collateral pool
    "https://api.goldsky.com/api/public/project_clysuc3c7f21y01ub6hd66nmp/subgraphs/hypersurface-sh-subgraph/latest/gn",
    // USDC-collateral pool
    "https://api.goldsky.com/api/public/project_clysuc3c7f21y01ub6hd66nmp/subgraphs/hypersurface-usdc-subgraph/latest/gn",
  ],
  [CHAIN.BASE]: [
    // USDC-collateral pool
    "https://api.goldsky.com/api/public/project_clysuc3c7f21y01ub6hd66nmp/subgraphs/hypersurface-base-subgraph/latest/gn",
  ],
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
      totalFee
      totalNotionalUSD
    }
  }
`;

interface Trade {
  id: string;
  createdTimestamp: string;
  totalPremium: string;
  totalFee: string;
  totalNotionalUSD: string;
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
    const response = await request<{ trades: Trade[] }>(
      subgraphUrl,
      TRADES_QUERY,
      {
        startTimestamp: startTimestamp.toString(),
        endTimestamp: endTimestamp.toString(),
        skip,
      }
    );

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
  const subgraphUrls = SUBGRAPH_URLS[options.chain];
  if (!subgraphUrls) {
    throw new Error(`No subgraph URL found for chain: ${options.chain}`);
  }

  // Get the time range for this fetch (startOfDay to endOfDay in seconds)
  const startTimestamp = options.startOfDay;
  const endTimestamp = options.startOfDay + 86400; // Next day

  // Fetch all trades in the time range, across every pool on this chain.
  // Pools are separate deployments with disjoint trade sets, so summing
  // them cannot double count.
  const tradesPerPool = await Promise.all(
    subgraphUrls.map((url) =>
      fetchAllTrades(url, startTimestamp, endTimestamp)
    )
  );
  const trades = tradesPerPool.flat();

  // Calculate volumes from trades
  let dailyNotionalVolume = 0;
  let dailyPremiumVolume = 0;
  let dailyFees = 0;

  for (const trade of trades) {
    // Premium and fee are stored in the pool's collateral decimals.
    // Every collateral in use (USDT0, USDC) is 6 decimals.
    dailyPremiumVolume += Number(trade.totalPremium) / 1e6;
    dailyFees += Number(trade.totalFee) / 1e6;

    // totalNotionalUSD is pre-calculated in the subgraph as:
    // (totalNotional × underlyingPrice) / 1e16
    // The division already happened in the subgraph, so this value is in whole USD
    dailyNotionalVolume += Number(trade.totalNotionalUSD);
  }

  return {
    dailyNotionalVolume,
    dailyPremiumVolume,
    dailyFees,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.HYPERLIQUID]: {
      fetch,
      start: "2025-09-16", // First trade on HyperEVM
    },
    [CHAIN.BASE]: {
      fetch,
      start: "2025-10-01", // First trade on Base
    },
  },
  methodology: {
    dailyNotionalVolume:
      "Sum of the notional value (in USD) of all options traded on the protocol each day, across every collateral pool on the chain. Calculated as sum of |leg.amount| × oracle_price_at_trade_time for each trade leg.",
    dailyPremiumVolume:
      "Sum of all premiums paid for options traded on the protocol each day, across every collateral pool on the chain.",
    dailyFees:
      "Sum of all fees collected by the protocol each day, across every collateral pool on the chain.",
  },
};

export default adapter;
