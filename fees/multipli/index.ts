import { SimpleAdapter, FetchResultFees, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

// Define the structure of a single pool object from your API response.
// This helps with type safety and makes the code easier to understand.
interface IYieldPool {
  pool: string;
  symbol: string;
  project: string;
  chain: string;
  tvlUsd: string; // The API returns this as a string
  apy: string;    // The API returns this as a string
}

// Define the structure of the overall API response.
interface IAPIResponse {
  status: string;
  message: string;
  payload: IYieldPool[];
}

const YIELD_ENDPOINT = "https://api.multipli.fi/multipli/v1/external-aggregator/defillama/yield/";

const fetch = async (timestamp: number): Promise<FetchResultFees> => {
  const response: IAPIResponse = await fetchURL(YIELD_ENDPOINT);

  const date = new Date(timestamp * 1000); // assuming UNIX timestamp in seconds
  const year = date.getUTCFullYear();
  const daysInYear = isLeapYear(year) ? 366 : 365;

  const totalDailyRevenue = response.payload.reduce((acc, pool) => {
    const tvl = parseFloat(pool.tvlUsd);
    const apy = parseFloat(pool.apy);

    if (isNaN(tvl) || isNaN(apy)) {
      console.error(`Invalid data for pool ${pool.pool}:`, pool);
      return acc;
    }

    const dailyRevenueForPool = (tvl * (apy / 100)) / daysInYear;

    return acc + dailyRevenueForPool;
  }, 0);

  return {
    dailyRevenue: totalDailyRevenue.toString(),
  };
};

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
}


const adapter: SimpleAdapter = {
  version: 1,
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch,
      start: '2025-07-28',
      runAtCurrTime: true,
      meta: {
        methodology: {
          Revenue: "Revenue is the total revenue generated from the protocol's yield-bearing pools, calculated by multiplying the Total Value Locked (TVL) by the daily equivalent yield rate.",
        }
      }
    },
  },
};

export default adapter;
