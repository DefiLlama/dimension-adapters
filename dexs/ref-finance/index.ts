import type { FetchOptions, SimpleAdapter } from "../../adapters/types";
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
      fetch: async(ts, _t: any, options: FetchOptions)=>{
        const data = await httpGet(api)
        const dateStr = new Date(options.startOfDay * 1000).toISOString().split('T')[0]
        const dailyVolume = data.find((t:any)=> t.date.split('T')[0] === dateStr)?.volume
        if (!dailyVolume || Number(dailyVolume) < 0 || Number((dailyVolume)) > 1_000_000_000) {
          throw new Error(`Invalid daily volume: ${dailyVolume}`)
        }
        return {
          timestamp: options.startOfDay ,
          dailyVolume: dailyVolume
        }
      }
    }
  }
};

export default adapter;
