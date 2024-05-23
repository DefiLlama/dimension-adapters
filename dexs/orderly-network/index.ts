import type { BreakdownAdapter, FetchOptions } from "../../adapters/types";
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
        fetch: async(__t: number, _: any, { startOfDay }: FetchOptions) => {
          try {
            const data = await httpGet(apiNear) // error
            const cleanTimestamp = getUniqStartOfTodayTimestamp(new Date(startOfDay * 1000))
            return {
              timestamp: cleanTimestamp,
              dailyVolume: data.find((t:any)=>dateToTs(t.date) === cleanTimestamp)?.volume
            }
          } catch (e) {
            console.error(e);
            return {
              timestamp: startOfDay,
              dailyVolume: 0
            }
          }
        }
      },
    },
    "orderly-network-derivatives": {
      [CHAIN.ARBITRUM]: {
        start: 1698278400,
        fetch: async (__t: number, _: any, { startOfDay }: FetchOptions) =>{
          const data = await httpGet(apiEVM)
          const cleanTimestamp = getUniqStartOfTodayTimestamp(new Date(startOfDay * 1000))
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
