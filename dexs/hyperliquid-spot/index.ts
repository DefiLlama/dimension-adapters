import type { SimpleAdapter } from "../../adapters/types";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";
import { httpPost } from "../../utils/fetchURL";

const URL = "https://api.hyperliquid.xyz/info";

interface Response {
  dayNtlVlm: string;
}

const fetch = async (timestamp: number) => {
  const respose: Response[] = (await httpPost(URL, {"type": "spotMetaAndAssetCtxs"}))[1];
  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000));
  const dailyVolume = respose.reduce((acc, item) => {
    return acc + Number(item.dayNtlVlm);
  },0);

  return {
    dailyVolume: dailyVolume?.toString(),
    timestamp: dayTimestamp,
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    "hyperliquid": {
      fetch,
      start: '2023-02-25',
    },
  }
};

export default adapter;
