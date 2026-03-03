import { CHAIN } from "../helpers/chains";
import { FetchOptions } from "../adapters/types";
import { METRIC } from "../helpers/metrics";
import fetchURL from "../utils/fetchURL";
let res: any;

const fetch = async (_: any, _1: any, options: FetchOptions) => {
  const startTime = new Date(options.startTimestamp * 1000).toISOString().split("T")[0]
  if (!res)
    res = fetchURL('https://dapi.bifrost.io/api/dapp/stats/overview')
  const v = (await res).find((v: { date: string }) => v.date === startTime)

  const dailyFees = options.createBalances();
  dailyFees.addUSDValue(+v.txFee);

  return { dailyFees };
};


const adapter: any = {
  version: 1,
  chains: [CHAIN.BIFROST],
  fetch,
  start: '2024-11-08',
};

export default adapter;
