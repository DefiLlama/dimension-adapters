import { CHAIN } from "../helpers/chains";
import { FetchOptions } from "../adapters/types";
import fetchURL from "../utils/fetchURL";
let res: any;

const fetch = async (options: FetchOptions) => {
  const startTime = new Date(options.startTimestamp * 1000).toISOString().split("T")[0]
  if (!res)
    res = fetchURL('https://dapi.bifrost.io/api/dapp/stats/swap')
  const v = (await res).volume.find((v: { date: string }) => v.date === startTime)

  return { dailyVolume: v.amount };
};


const adapter: any = {
  fetch,
  chains: [CHAIN.BIFROST],
  start: '2024-11-08',
};

export default adapter;
