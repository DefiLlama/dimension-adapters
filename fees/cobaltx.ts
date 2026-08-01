import fetchURL from "../utils/fetchURL";
import { FetchOptions, FetchResult, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";


const fetch = async ({ chain }: FetchOptions): Promise<FetchResult> => {
  const response = await fetchURL(config[chain] + '/pools/info/list?poolType=concentrated&poolSortField=volume24h&sortType=desc&pageSize=1000&page=1')
  const dailyFees = response.data.reduce((acc: number, pool: any) => acc + Number(pool.day.volumeFee), 0);
  return {
    dailyFees,
  };
};

const config: any = {
  [CHAIN.SOON]: "https://api.cobaltx.io",
  [CHAIN.SOON_BSC]: "https://api.svmbnb.cobaltx.io",
  [CHAIN.SOON_BASE]: "https://api.soonbase.cobaltx.io",
}

const adapter: SimpleAdapter = {
  fetch,
  chains: Object.keys(config),
  runAtCurrTime: true,
  adapter: {},
};

export default adapter;
