import { SimpleAdapter, FetchOptions } from "../adapters/types";
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

const fetch = async (_timestamp: number, _chainBlocks: any, options: FetchOptions) => {
  const { startTimestamp, endTimestamp } = options;

  const dailyFees = options.createBalances();

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

  dailyFees.addUSDValue(totalYield);

  return {
    dailyFees,
    dailyRevenue: 0,
    dailySupplySideRevenue: dailyFees,
  };
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.SOLANA],
  start: '2025-06-04',
  methodology: {
    Fees: 'All yield from backing assets.',
    Revenue: 'No revenue share from fees.',
    SupplySideRevenue: 'All fees are distributed to sUSDv stakers.',
  }
};

export default adapter;
