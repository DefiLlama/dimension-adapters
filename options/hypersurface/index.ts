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

  // Use the v2 fetch window so the adapter is correct for any run length,
  // including hourly runs. The range is half-open, so consecutive windows
  // never double count a trade.
  const { startTimestamp, endTimestamp } = options;

  // Fetch all trades in the time range, across every pool on this chain.
  // Pools are separate deployments with disjoint trade sets, so summing
  // them cannot double count.
  // Each pool is settled independently so that one unreachable subgraph does
  // not discard the pools that did respond. If every pool fails the error is
  // propagated, since that indicates a systemic failure rather than one flaky
  // endpoint.
  const results = await Promise.allSettled(
    subgraphUrls.map((url) =>
      fetchAllTrades(url, startTimestamp, endTimestamp)
    )
  );

  const failures = results.filter(
    (r): r is PromiseRejectedResult => r.status === "rejected"
  );
  if (failures.length === results.length) {
    throw failures[0].reason;
  }
  for (const failure of failures) {
    console.error(
      `hypersurface: skipping unreachable pool subgraph on ${options.chain}:`,
      failure.reason
    );
  }

  const trades = results
    .filter(
      (r): r is PromiseFulfilledResult<Trade[]> => r.status === "fulfilled"
    )
    .flatMap((r) => r.value);

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

  // Protocol fees accrue entirely to the protocol; there is no supply-side
  // payout from the fee, so dailyFees = dailyRevenue + dailySupplySideRevenue
  // holds with the supply side at zero.
  return {
    dailyNotionalVolume,
    dailyPremiumVolume,
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
    dailySupplySideRevenue: 0,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
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
    NotionalVolume:
      "Sum of the notional value (in USD) of all options traded on the protocol during the period, across every collateral pool on the chain. Calculated as sum of |leg.amount| x oracle_price_at_trade_time for each trade leg.",
    PremiumVolume:
      "Sum of all premiums paid for options traded on the protocol during the period, across every collateral pool on the chain.",
    Fees:
      "Protocol fees charged on trades during the period, across every collateral pool on the chain.",
    Revenue:
      "All protocol fees charged on trades. Hypersurface pays no share of the trade fee to liquidity providers, so revenue equals fees.",
    ProtocolRevenue:
      "All protocol fees charged on trades, which accrue to the protocol.",
    SupplySideRevenue:
      "Zero. Liquidity providers earn from the option premium and the pool's hedging performance, not from a share of the protocol trade fee.",
  },
  breakdownMethodology: {
    NotionalVolume: {
      "USDT0 pool": "Notional traded against the USDT0-collateral pool on HyperEVM, from its subgraph.",
      "USDC pool": "Notional traded against the USDC-collateral pool (HyperEVM and Base), from its subgraph.",
    },
    PremiumVolume: {
      "USDT0 pool": "Premium paid on trades against the USDT0-collateral pool on HyperEVM.",
      "USDC pool": "Premium paid on trades against the USDC-collateral pool (HyperEVM and Base).",
    },
    Fees: {
      "USDT0 pool": "Protocol fees charged on trades against the USDT0-collateral pool on HyperEVM.",
      "USDC pool": "Protocol fees charged on trades against the USDC-collateral pool (HyperEVM and Base).",
    },
  },
};

export default adapter;
