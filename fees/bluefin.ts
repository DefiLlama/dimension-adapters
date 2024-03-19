import fetchURL from "../utils/fetchURL"
import { FetchResultFees, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const url_sui="https://dapi.api.sui-prod.bluefin.io/marketData/fees"



const fetch_sui = async (timestamp: number): Promise<FetchResultFees> => {
    const result= await fetchURL(url_sui);
    const dailyFees=result.last24HoursFees;
    const totalFees=result.totalFees;

  return {
    dailyFees: dailyFees ? `${dailyFees}` : undefined,
    totalFees: totalFees ? `${totalFees}` : undefined,
    timestamp: timestamp,
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.SUI]: {
        fetch: fetch_sui,
        start: 1700265600,
        runAtCurrTime: true,
      },
  },
};

export default adapter;
