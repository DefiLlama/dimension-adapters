import type { SimpleAdapter } from "../../adapters/types";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";
import { httpPost } from "../../utils/fetchURL";

const URL = "https://api.hyperliquid.xyz/info";

interface Response {
  dayNtlVlm: string;
  openInterest: string;
}

const fetch = async (timestamp: number) => {
  const response: Response[] = (await httpPost(URL, {"type": "metaAndAssetCtxs"}))[1];
  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000));
  const dailyVolume = response.reduce((acc, item) => {
    return acc + Number(item.dayNtlVlm);
  },0);
  const openInterestAtEnd = response.reduce((acc, item) => {
    return acc + Number(item.openInterest);
  },0);

  return {
    dailyVolume: dailyVolume?.toString(),
    openInterestAtEnd: openInterestAtEnd?.toString(),
    timestamp: dayTimestamp,
  };
};

const adapter: SimpleAdapter = {
  version: 1,
  adapter: {
    "hyperliquid": {
      fetch,
      start: '2023-02-25',
    },
  }
};

export default adapter;
