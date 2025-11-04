import fetchURL from "../utils/fetchURL"
import { FetchResultFees, SimpleAdapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const ember_fees_url="https://vaults.api.sui-prod.bluefin.io/api/v1/vaults/fees"

const fetch = async ({ startTimestamp, endTimestamp }: FetchOptions): Promise<FetchResultFees> => {

  console.log(startTimestamp, endTimestamp);
  console.log(`${ember_fees_url}?startTimestampInMs=${startTimestamp*1000}&endTimestampInMs=${endTimestamp*1000}`);
  const result= await fetchURL(`${ember_fees_url}?startTimestampInMs=${startTimestamp*1000}&endTimestampInMs=${endTimestamp*1000}`);
  const feesUsdE9=result.feesUsdE9;
  const revenueUsdE9=result.revenueUsdE9;

  return {
    dailyFees: Number(feesUsdE9)/1e9,
    dailyRevenue: Number(revenueUsdE9)/1e9,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.SUI]: {
        fetch,
        start: '2025-09-01',
        runAtCurrTime: true,
      },
  },
};

export default adapter;
