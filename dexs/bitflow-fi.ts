import fetchURL from "../utils/fetchURL";
import { FetchResult, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../helpers/getUniSubgraphVolume";

const URL = "https://app.bitflow.finance/api/pool-volume";

const fetch = async (): Promise<FetchResult> => {
  const dayTimestamp = getUniqStartOfTodayTimestamp();
  const { data }: any = await fetchURL(URL);
  let dailyVolume = 0
  for (const [_, pool] of Object.entries(data)) {
    dailyVolume += Number((pool as any).totalOutAmountUsd)
  }
  return {
    dailyVolume,
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
