import type { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { httpGet } from "../../utils/fetchURL";

interface ApiResponse {
    DATE: string;
    GROSS_AMOUNT_USD: number;
  }
  
  const dateToTs = (date: string) => {
    const cleanDate = date.split('.')[0].replace(' ', 'T');
    return new Date(cleanDate).getTime() / 1000;
  }

const api = "https://flipsidecrypto.xyz/api/v1/queries/72e88d8e-3fa6-43d9-9938-1b29e081eec1/data/latest"

const adapter: SimpleAdapter = {
  adapter: {
    "near":{
      start: async()=>{
        const data = await httpGet(api)
        return dateToTs(data[0].DATE)
      },
      fetch: async(ts, _t: any, options: FetchOptions)=>{
        const data = await httpGet(api)
        const dateStr = new Date(options.startOfDay * 1000).toISOString().split('T')[0]
        console.log('Searching for date:', dateStr)
        console.log('Available dates:', data.map((d: ApiResponse) => d.DATE.split('T')[0]))
        const dailyVolume = data.find((t:ApiResponse)=> {
          const recordDate = t.DATE.split(' ')[0]
          return recordDate === dateStr
        })?.GROSS_AMOUNT_USD
        if (!dailyVolume || Number(dailyVolume) < 0 || Number((dailyVolume)) > 50_000_000_000) {
          throw new Error(`Invalid daily volume: ${dailyVolume} for date ${dateStr}`)
        }
        return {
          timestamp: options.startOfDay,
          dailyVolume: dailyVolume
        }
      }
    }
  }
};

export default adapter;