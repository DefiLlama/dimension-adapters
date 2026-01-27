import { CHAIN } from "../../helpers/chains";
import { FetchOptions } from "../../adapters/types";
import fetchURL from "../../utils/fetchURL";

const fetch = async (_: any, _1: any, options: FetchOptions) => {
  const res = await fetchURL('https://dapi.bifrost.io/api/dapp/stats')
  const { dailyFees, dailyRevenue, } = res.find(v => v.date === options.dateString)

  return { dailyFees, dailyRevenue, };
};


const adapter: any = {
  adapter: {
    [CHAIN.BIFROST]: {
      fetch,
      start: '2022-01-01',
    },
  },
};

export default adapter;
