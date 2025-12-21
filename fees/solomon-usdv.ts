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

  // All yield goes to sUSDv holders (supply side)
  const dailySupplySideRevenue = options.createBalances();
  dailySupplySideRevenue.addUSDValue(totalYield);

  return {
    dailyFees,
    dailyRevenue: dailySupplySideRevenue,
    dailySupplySideRevenue,
  };
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.SOLANA],
  start: '2025-06-04',
};

export default adapter;
