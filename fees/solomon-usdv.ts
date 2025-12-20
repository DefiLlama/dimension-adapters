import { Adapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import fetchURL from "../utils/fetchURL";

interface YieldDistribution {
  yieldAmount: string;
  transactionTimestamp: number;
  allTimeApy: string;
}

interface YieldDistributionsResponse {
  data: YieldDistribution[];
}

const fetch = async (options: FetchOptions) => {
  const { startTimestamp, endTimestamp } = options;

  // Fetch all yield distributions
  const response: YieldDistributionsResponse = await fetchURL(
    "https://data.solomonlabs.io/api/solomon-protocol/staking/yield-distributions?limit=1000"
  );

  // Filter distributions within the time range
  const distributions = response.data.filter(
    (d) => d.transactionTimestamp >= startTimestamp * 1000 &&
           d.transactionTimestamp < endTimestamp * 1000
  );

  // Sum up yield amounts for the day (amounts are in raw units with 9 decimals for USDC)
  const totalYield = distributions.reduce(
    (sum, d) => sum + Number(d.yieldAmount) / 1e9,
    0
  );

  const dailyFees = options.createBalances();
  dailyFees.addUSDValue(totalYield);

  // All yield goes to stakers (sUSDv holders)
  const dailyHoldersRevenue = options.createBalances();
  dailyHoldersRevenue.addUSDValue(totalYield);

  return {
    dailyFees,
    dailyRevenue: dailyHoldersRevenue,
    dailyHoldersRevenue,
  };
};

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.SOLANA]: {
      fetch,
      start: '2025-06-04', // First yield distribution
    },
  },
  methodology: {
    Fees: 'Yield generated from basis trading strategies (funding rates on perpetual futures).',
    Revenue: 'All yield is distributed to sUSDv holders (staked USDv).',
    HoldersRevenue: 'Yield earned by sUSDv token holders from the protocol\'s delta-neutral basis trading strategy.',
  },
};

export default adapter;
