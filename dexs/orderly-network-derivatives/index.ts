import axios from "axios";
import type { SimpleAdapter } from "../../adapters/types";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";

const dateToTs = (date: string) => new Date(date).getTime() / 1000

const apiEVM = "https://api-evm.orderly.org/md/volume/daily_stats"

const adapter: SimpleAdapter = {
  adapter: {
    "arbitrum":{
      start: async()=>{
        const data = await axios.get(apiEVM)
        return dateToTs(data.data[0].date)
      },
      fetch: async(ts)=>{
        const data = await axios.get(apiEVM)
        const cleanTimestamp = getUniqStartOfTodayTimestamp(new Date(ts * 1000))
        return {
          timestamp: cleanTimestamp,
          dailyVolume: data.data.find((t:any)=>dateToTs(t.date) === cleanTimestamp)?.volume
        }
      }
    }
  }
};

export default adapter;