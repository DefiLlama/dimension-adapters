import { CHAIN } from "../../helpers/chains";
import { FetchOptions } from "../../adapters/types";
import fetchURL from "../../utils/fetchURL";

const fetch = async (options: FetchOptions) => {
  const res = await fetchURL('https://dapi.bifrost.io/api/dapp/stats')
  const { dailyFees, dailyRevenue, } = res.find(v => v.date === options.dateString)

  return { dailyFees, dailyRevenue, };
};


const adapter: any = {
  version: 1,
  fetch,
  chains: [CHAIN.BIFROST],
  start: '2022-01-01',
};

export default adapter;
