import fetchURL from "../utils/fetchURL"
import { FetchResultFees, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const fees_url="https://api.sui-prod.bluefin.io/api/v1/accounts/fees"



const fetch_sui = async (timestamp: number): Promise<FetchResultFees> => {
    const result= await fetchURL(fees_url);
    const dailyFees=result.last24HoursTradingFees[0].amountE9/1e9;

  return {
    dailyFees: dailyFees ? `${dailyFees}` : undefined,
    dailyRevenue: dailyFees ? `${dailyFees}` : undefined,
    timestamp: timestamp,
  };
};

const adapter: SimpleAdapter = {
  version: 1,
  adapter: {
    [CHAIN.SUI]: {
        fetch: fetch_sui,
        runAtCurrTime: true,
      },
  },
};

export default adapter;
