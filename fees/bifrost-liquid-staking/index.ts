import { CHAIN } from "../../helpers/chains";
import { FetchOptions } from "../../adapters/types";
import fetchURL from "../../utils/fetchURL";

const fetch = async (options: FetchOptions) => {
  const startTime = new Date(options.startTimestamp * 1000).toISOString().split("T")[0]
  const res = await fetchURL('https://dapi.bifrost.io/api/dapp/stats')
  const { dailyFees, dailyRevenue, } = res.find(v => v.date === startTime)

  return { dailyFees, dailyRevenue, timestamp: options.startTimestamp };
};


const adapter: any = {
  version: 2,
  adapter: {
    [CHAIN.BIFROST]: {
      fetch,
      start: '2022-01-01',
    },
  },
};

export default adapter;
