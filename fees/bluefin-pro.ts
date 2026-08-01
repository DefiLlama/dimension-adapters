import fetchURL from "../utils/fetchURL"
import { FetchResultFees, SimpleAdapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const fees_url="https://api.sui-prod.bluefin.io/api/v1/accounts/fees"



const fetch = async (_options: FetchOptions): Promise<FetchResultFees> => {
    const result= await fetchURL(fees_url);
    const dailyFees=result.last24HoursTradingFees[0].amountE9/1e9;

  return {
    dailyFees: dailyFees ? `${dailyFees}` : undefined,
    dailyRevenue: dailyFees ? `${dailyFees}` : undefined,
  };
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.SUI],
  runAtCurrTime: true,
};

export default adapter;
