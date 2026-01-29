import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { request, gql } from "graphql-request";

// Hypersurface Protocol - DeFi Structured Products Platform
// Website: https://hypersurface.io
// Twitter: https://x.com/hypersurfaceX
// Category: Options

// Subgraph endpoints (same as analytics dashboard uses)
const SUBGRAPH_URLS: { [chain: string]: string } = {
  [CHAIN.HYPERLIQUID]:
    "https://api.goldsky.com/api/public/project_clysuc3c7f21y01ub6hd66nmp/subgraphs/hypersurface-sh-subgraph/latest/gn",
  [CHAIN.BASE]:
    "https://api.goldsky.com/api/public/project_clysuc3c7f21y01ub6hd66nmp/subgraphs/hypersurface-base-subgraph/latest/gn",
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
  const subgraphUrl = SUBGRAPH_URLS[options.chain];
  if (!subgraphUrl) {
    throw new Error(`No subgraph URL found for chain: ${options.chain}`);
  }

  // Get the time range for this fetch (startOfDay to endOfDay in seconds)
  const startTimestamp = options.startOfDay;
  const endTimestamp = options.startOfDay + 86400; // Next day

  // Fetch all trades in the time range
  const trades = await fetchAllTrades(subgraphUrl, startTimestamp, endTimestamp);

  if (trades.length === 0) {
    return {
      dailyNotionalVolume: 0,
      dailyPremiumVolume: 0,
      dailyFees: 0,
    };
  }

  // Calculate volumes from trades
  let dailyNotionalVolume = 0;
  let dailyPremiumVolume = 0;
  let dailyFees = 0;

  for (const trade of trades) {
    // Premium and fee are stored in 6 decimals (USDC precision)
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
      "Sum of the notional value (in USD) of all options traded on the protocol each day. Calculated as sum of |leg.amount| × oracle_price_at_trade_time for each trade leg.",
    dailyPremiumVolume:
      "Sum of all premiums paid for options traded on the protocol each day.",
    dailyFees: "Sum of all fees collected by the protocol each day.",
  },
};

export default adapter;
