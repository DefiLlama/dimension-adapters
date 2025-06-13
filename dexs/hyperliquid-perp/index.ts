import type { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";
import { httpPost } from "../../utils/fetchURL";

const URL = "https://api.hyperliquid.xyz/info";

interface Response {
  dayNtlVlm: string;
  openInterest: string;
  markPx: string;
}

const fetch = async (timestamp: number) => {
  const response: Response[] = (await httpPost(URL, {"type": "metaAndAssetCtxs"}))[1];
  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000));
  const dailyVolume = response.reduce((acc, item) => {
    return acc + Number(item.dayNtlVlm);
  },0);
  const openInterestAtEnd = response.reduce((acc, item) => {
    return acc +( Number(item.openInterest) * Number(item.markPx));
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
    [CHAIN.HYPERLIQUID]: {
      fetch,
      runAtCurrTime: true,
      start: '2023-02-25',
    },
  }
};

export default adapter;
