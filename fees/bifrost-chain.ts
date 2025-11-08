import { CHAIN } from "../helpers/chains";
import { FetchOptions } from "../adapters/types";
import fetchURL from "../utils/fetchURL";
let res: any;

const fetch = async (_: any, _1: any, options: FetchOptions) => {
  const startTime = new Date(options.startTimestamp * 1000).toISOString().split("T")[0]
  if (!res)
    res = fetchURL('https://dapi.bifrost.io/api/dapp/stats/overview')
  const v = (await res).find((v: any) => v.date === startTime)

  return { dailyFees: +v.txFee };
};


const adapter: any = {
  adapter: {
    [CHAIN.BIFROST]: {
      fetch,
      start: '2024-11-08',
    },
  },
};

export default adapter;
