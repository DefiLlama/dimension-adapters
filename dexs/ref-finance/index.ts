import type { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { httpGet } from "../../utils/fetchURL";

// const dateToTs = (date: string) => new Date(date).getTime() / 1000

// const api = "https://api.stats.ref.finance/api/volume24h?period=730"
const api = "https://api.ref.finance/v3/24h/chart/line?day=365"

const getPools = async () => {
  return (await httpGet('https://api.ref.finance/pool/search?type=all&sort=tvl&limit=10000&labels=&offset=0&hide_low_pool=false&order_by=desc')).data.list;
}

const adapter: SimpleAdapter = {
  adapter: {
    "near":{
      // start: async()=>{
      //   const data = await httpGet(api)
      //   return dateToTs(data[0].date)
      // },
      runAtCurrTime: true,
      fetch: async(_ts: any, _t: any, options: FetchOptions)=>{
        const pools = await getPools();

        let volume = 0
        for (const pool of pools) {
          volume += Number(pool.volume_24h);
        }
        
        return {
          timestamp: options.startOfDay,
          dailyVolume: volume,
        }
      }
    }
  }
};

export default adapter;
