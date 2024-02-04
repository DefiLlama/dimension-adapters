import type { SimpleAdapter } from "../../adapters/types";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";
import { httpGet } from "../../utils/fetchURL";

const dateToTs = (date: string) => new Date(date).getTime() / 1000

const apiEVM = "https://api-evm.orderly.org/md/volume/daily_stats"

const adapter: SimpleAdapter = {
  adapter: {
    "arbitrum":{
      start: async()=>{
        const data = await httpGet(apiEVM)
        return dateToTs(data[0].date)
      },
      fetch: async(ts)=>{
        const data = await httpGet(apiEVM)
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