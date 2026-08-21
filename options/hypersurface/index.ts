import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { request, gql } from "graphql-request";

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

// Each collateral pool is indexed by its own subgraph, so a chain can have
// several: HyperEVM runs a USDT0-collateral pool and a USDC-collateral pool
// side by side, and both must be summed to get the chain's real volume.
// The label is carried through to the returned balances so the per-pool
// breakdown can be populated.
const POOLS: { [chain: string]: Pool[] } = {
  [CHAIN.HYPERLIQUID]: [
    {
      label: USDT0_POOL,
      url: "https://api.goldsky.com/api/public/project_clysuc3c7f21y01ub6hd66nmp/subgraphs/hypersurface-sh-subgraph/latest/gn",
    },
    {
      label: USDC_POOL,
      url: "https://api.goldsky.com/api/public/project_clysuc3c7f21y01ub6hd66nmp/subgraphs/hypersurface-usdc-subgraph/latest/gn",
    },
  ],
  [CHAIN.BASE]: [
    {
      label: USDC_POOL,
      url: "https://api.goldsky.com/api/public/project_clysuc3c7f21y01ub6hd66nmp/subgraphs/hypersurface-base-subgraph/latest/gn",
    },
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
  const pools = POOLS[options.chain];
  if (!pools) {
    throw new Error(`No subgraph URL found for chain: ${options.chain}`);
  }

  // Use the v2 fetch window so the adapter is correct for any run length,
  // including hourly runs. The range is half-open, so consecutive windows
  // never double count a trade.
  const { startTimestamp, endTimestamp } = options;

  const dailyNotionalVolume = options.createBalances();
  const dailyPremiumVolume = options.createBalances();
  const dailyFees = options.createBalances();

  // Each pool is settled independently so that one unreachable subgraph does
  // not discard the pools that did respond. If every pool fails the error is
  // propagated, since that indicates a systemic failure rather than one flaky
  // endpoint.
  const results = await Promise.allSettled(
    pools.map((pool) => fetchAllTrades(pool.url, startTimestamp, endTimestamp))
  );

  const failures = results.filter(
    (r): r is PromiseRejectedResult => r.status === "rejected"
  );
  if (failures.length === results.length) {
    throw failures[0].reason;
  }

  results.forEach((result, i) => {
    const { label } = pools[i];
    if (result.status === "rejected") {
      console.error(
        `hypersurface: skipping unreachable ${label} subgraph on ${options.chain}:`,
        result.reason
      );
      return;
    }

    for (const trade of result.value) {
      // Premium and fee are stored in the pool's collateral decimals.
      // Every collateral in use (USDT0, USDC) is 6 decimals and dollar pegged.
      dailyPremiumVolume.addUSDValue(Number(trade.totalPremium) / 1e6, label);
      dailyFees.addUSDValue(Number(trade.totalFee) / 1e6, label);

      // totalNotionalUSD is pre-calculated in the subgraph as:
      // (totalNotional x underlyingPrice) / 1e16
      // The division already happened in the subgraph, so this value is in whole USD
      dailyNotionalVolume.addUSDValue(Number(trade.totalNotionalUSD), label);
    }
  });

  // The protocol fee switch is currently off, so every fee component is zero.
  // When it is enabled the referrer share becomes dailySupplySideRevenue and
  // the buyback share becomes dailyHoldersRevenue; the remainder is protocol
  // revenue. dailyFees = dailyRevenue + dailySupplySideRevenue holds today
  // with the supply side at zero.
  return {
    dailyNotionalVolume,
    dailyPremiumVolume,
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
    dailyHoldersRevenue: 0,
    dailySupplySideRevenue: 0,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  // Hourly pulls would issue 24 windows x one query per collateral pool against
  // the same Goldsky endpoint, which exceeds its shared rate limit and fails the
  // run. Daily granularity is sufficient here, and the fetch honours whatever
  // window it is given via startTimestamp/endTimestamp.
  pullHourly: false,
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
      "Protocol fees charged on trades, across every collateral pool on the chain. The fee is min(3bps of notional, 12.5% of premium). The fee switch is currently off, so this is zero.",
    Revenue:
      "Protocol fees kept by the protocol, i.e. fees minus the referrer share. Zero while the fee switch is off.",
    ProtocolRevenue:
      "Protocol fees accruing to the protocol rather than to referrers. Zero while the fee switch is off.",
    HoldersRevenue:
      "Protocol fees routed to the HYPE buyback, which accrues to token holders. Zero while the fee switch is off.",
    SupplySideRevenue:
      "Referrer share of the protocol fee. Liquidity providers are not paid from the trade fee, they earn from option premium and the pool's hedging performance, so only referrers count here. Zero while the fee switch is off.",
  },
  breakdownMethodology: {
    NotionalVolume: {
      [USDT0_POOL]: "Notional traded against the USDT0-collateral pool on HyperEVM, from its subgraph.",
      [USDC_POOL]: "Notional traded against the USDC-collateral pools on HyperEVM and Base, from their subgraphs.",
    },
    PremiumVolume: {
      [USDT0_POOL]: "Premium paid on trades against the USDT0-collateral pool on HyperEVM.",
      [USDC_POOL]: "Premium paid on trades against the USDC-collateral pools on HyperEVM and Base.",
    },
    Fees: {
      [USDT0_POOL]: "Protocol fees charged on trades against the USDT0-collateral pool on HyperEVM.",
      [USDC_POOL]: "Protocol fees charged on trades against the USDC-collateral pools on HyperEVM and Base.",
    },
  },
};

export default adapter;
