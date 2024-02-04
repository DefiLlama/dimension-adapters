import type { SimpleAdapter } from "../../adapters/types";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";
import { httpGet } from "../../utils/fetchURL";

const dateToTs = (date: string) => new Date(date).getTime() / 1000

const apiNear = "https://api.orderly.org/md/volume/daily_stats"

const adapter: SimpleAdapter = {
  adapter: {
    "near":{
      start: async()=>{
        const data = await httpGet(apiNear)
        return dateToTs(data[0].date)
      },
      fetch: async(ts)=>{
        const data = await httpGet(apiNear)
        const cleanTimestamp = getUniqStartOfTodayTimestamp(new Date(ts * 1000))
        return {
          timestamp: cleanTimestamp,
          dailyVolume: data.find((t:any)=>dateToTs(t.date) === cleanTimestamp)?.volume
        }
      }
    },
  },
};

export default adapter;