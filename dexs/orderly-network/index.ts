import type { BreakdownAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";
import { httpGet } from "../../utils/fetchURL";

const dateToTs = (date: string) => new Date(date).getTime() / 1000
const apiNear = "https://api.orderly.org/md/volume/daily_stats"
const apiEVM = "https://api-evm.orderly.org/md/volume/daily_stats"

const adapter: BreakdownAdapter = {
  breakdown: {
    "orderly-network": {
      [CHAIN.NEAR]: {
        start: 1669977923,
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
    "orderly-network-derivatives": {
      [CHAIN.ARBITRUM]: {
        start: 1698278400,
        fetch: async (timestamp: number) =>{
          const data = await httpGet(apiEVM)
          const cleanTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000))
          return {
            timestamp: cleanTimestamp,
            dailyVolume: data.find((t:any)=>dateToTs(t.date) === cleanTimestamp)?.volume
          }
        }
      }
    }
  }
}
export default adapter;
