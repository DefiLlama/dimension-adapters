import type { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";

interface ApiResponse {
  DATE: string;
  GROSS_AMOUNT_USD: number;
}
let data
const api = "https://app.near-intents.org/api/stats/trading_volume"

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.NEAR]: {
      start: '2024-11-05',
      fetch: async (_ts, _t: any, options: FetchOptions) => {
        if (!data) data = httpGet(api)
        const dailyVolume = (await data).find((t: ApiResponse) => {
          const recordDate = t.DATE.split(' ')[0]
          return recordDate === options.dateString
        })?.GROSS_AMOUNT_USD
        if (!dailyVolume || Number(dailyVolume) < 0 || Number((dailyVolume)) > 50_000_000_000) {
          throw new Error(`Invalid daily volume: ${dailyVolume} for date ${options.dateString}`);
        }
        return {
          dailyVolume: dailyVolume
        }
      }
    }
  }
};

export default adapter;