import fetchURL from "../utils/fetchURL"
import { FetchResultFees, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const url_sui="https://dapi.api.sui-prod.bluefin.io/marketData/fees"

const fetch = async (_: number): Promise<FetchResultFees> => {
  const result= await fetchURL(url_sui);
  const dailyFees=result.last24HoursFees;

  return {
    dailyFees,
    dailyRevenue: dailyFees,
  };
};

const adapter: SimpleAdapter = {
  version: 1,
  adapter: {
    [CHAIN.SUI]: {
        fetch,
        start: '2023-11-18',
        runAtCurrTime: true,
      },
  },
};

export default adapter;
