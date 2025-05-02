import fetchURL from "../utils/fetchURL"
import { FetchResultFees, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const url_sui="https://dapi.api.sui-prod.bluefin.io/marketData/fees"



const fetch_sui = async (timestamp: number): Promise<FetchResultFees> => {
    const result= await fetchURL(url_sui);
    const dailyFees=result.last24HoursFees;
    const totalFees=result.totalFees;

  return {
    dailyFees,
    totalFees,
    dailyRevenue: dailyFees,
    totalRevenue: totalFees,
    timestamp: timestamp,
  };
};

const adapter: SimpleAdapter = {
  version: 1,
  adapter: {
    [CHAIN.SUI]: {
        fetch: fetch_sui,
        start: '2023-11-18',
        runAtCurrTime: true,
      },
  },
};

export default adapter;
