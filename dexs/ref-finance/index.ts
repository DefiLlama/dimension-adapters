import type { SimpleAdapter } from "../../adapters/types";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";
import { httpGet } from "../../utils/fetchURL";

const dateToTs = (date: string) => new Date(date).getTime() / 1000

const api = "https://api.stats.ref.finance/api/volume24h?period=730"

const adapter: SimpleAdapter = {
  adapter: {
    "near":{
      start: async()=>{
        const data = await httpGet(api)
        return dateToTs(data[0].date)
      },
      fetch: async(ts)=>{
        const data = await httpGet(api)
        const cleanTimestamp = getUniqStartOfTodayTimestamp(new Date(ts * 1000))
        return {
          timestamp: cleanTimestamp,
          dailyVolume: data.find((t:any)=>dateToTs(t.date) === cleanTimestamp)?.volume
        }
      }
    }
  }
};

export default adapter;