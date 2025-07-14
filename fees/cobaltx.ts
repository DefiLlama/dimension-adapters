import fetchURL from "../utils/fetchURL";
import { FetchResult, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const URL = "https://api.cobaltx.io/pools/info/list?poolType=concentrated&poolSortField=volume24h&sortType=desc&pageSize=1000&page=1";

const fetch = async (): Promise<FetchResult> => {
  const response = await fetchURL(URL)
  const dailyFees = response.data.reduce((acc: number, pool: any) => acc + Number(pool.day.volumeFee), 0);
  return {
    dailyFees,
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.SOON]: {
      fetch,
      runAtCurrTime: true
    },
  },
};

export default adapter;
