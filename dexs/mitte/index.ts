import type { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { httpGet } from "../../utils/fetchURL";

const startTimestamp = 1710288000 // 2024-03-13

const api = "https://apitest.mitte.gg/v1/meme/daily-volume"

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    "near": {
      start: startTimestamp,
      fetch: async ({ toTimestamp }: FetchOptions) => {
        const data = await httpGet(`${api}?ts=${toTimestamp}`)
        const dailyVolume = +data.dailyVolumeUSD
        if (isNaN(dailyVolume) || dailyVolume < 0 || dailyVolume > 1e9)
          throw new Error(`Invalid daily volume: ${dailyVolume}`)

        return { dailyVolume, }
      }
    }
  }
};

export default adapter;
