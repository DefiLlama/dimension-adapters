import fetchURL from "../utils/fetchURL";
import { FetchResult, SimpleAdapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const URL = "https://gateway.velar.network/watcherapp/pool";

const fetch = async (_options: FetchOptions): Promise<FetchResult> => {
  const { message }: any = await fetchURL(URL);
  let dailyVolume = 0
  let dailyFees = 0
  message.forEach((pool: any) => {
    dailyVolume += Number(pool.stats.volume.value)
    dailyFees += Number(pool.stats.fees.value)
  })
  return {
    dailyVolume,
    dailyFees,
  };
};

const adapter: SimpleAdapter = {
  fetch,
  chains: [CHAIN.STACKS],
  runAtCurrTime: true,
};

export default adapter;
