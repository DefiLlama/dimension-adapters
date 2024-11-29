import type { SimpleAdapter } from "../../adapters/types";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";
import { CHAIN } from "../../helpers/chains";
import { httpGet, httpPost } from "../../utils/fetchURL";

const URL = "https://api.hyperliquid.xyz/info";

interface Response {
  totalVolume?: number;
  dailyVolume?: number;
}

const fetch = async (timestamp: number) => {
  const {totalVolume, dailyVolume}: Response = (await httpPost(URL, {"type": "globalStats"}));
  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000));

  return {
    totalVolume: totalVolume?.toString(),
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
