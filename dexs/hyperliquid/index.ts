import type { SimpleAdapter } from "../../adapters/types";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";
import { CHAIN } from "../../helpers/chains";
import axios from "axios";

const URL = "https://api.hyperliquid.xyz/info";

interface Response {
  totalVolume?: number;
  dailyVolume?: number;
}

const fetch = async (timestamp: number) => {
  const {totalVolume, dailyVolume}: Response = await axios.post(URL, {"type":"globalStats"});
  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000));

  return {
    totalVolume: totalVolume?.toString(),
    dailyVolume: dailyVolume?.toString(),
    timestamp: dayTimestamp,
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch,
      start: async () => 1677283200,
    },
  }
};

export default adapter;
