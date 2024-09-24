import type { SimpleAdapter } from "../../adapters/types";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";
import { httpGet } from "../../utils/fetchURL";

const startTimestamp = 1710288000 // 2024-03-13

const api = "https://apitest.mitte.gg/v1/meme/daily-volume"

const adapter: SimpleAdapter = {
  adapter: {
    "near":{
      start: async () => startTimestamp,
      fetch: async (ts) => {
        const data = await httpGet(`${api}?ts=${ts}`)
        
        const cleanTimestamp = getUniqStartOfTodayTimestamp(new Date(ts * 1000))

        const dailyVolume = data.dailyVolumeUSD

        if (!dailyVolume || Number(dailyVolume) < 0 || Number((dailyVolume)) > 1_000_000_000) {
          throw new Error(`Invalid daily volume: ${dailyVolume}`)
        }

        return {
          timestamp: cleanTimestamp,
          dailyVolume: data.dailyVolume,
        }
      }
    }
  }
};

export default adapter;
