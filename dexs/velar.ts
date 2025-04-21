import fetchURL from "../utils/fetchURL";
import { FetchResult, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../helpers/getUniSubgraphVolume";

const URL = "https://gateway.velar.network/watcherapp/pool";

const fetch = async (): Promise<FetchResult> => {
  const dayTimestamp = getUniqStartOfTodayTimestamp();
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
    timestamp: dayTimestamp,
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.STACKS]: {
      fetch,
      runAtCurrTime: true
    },
  },
};

export default adapter;
