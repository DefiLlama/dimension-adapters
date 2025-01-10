import type { SimpleAdapter } from '../../adapters/types'
import { httpPost } from '../../utils/fetchURL';
import {CHAIN} from "../../helpers/chains";

const API_SERVICE_URL = 'https://api.cvex.trade/v1/statistics/volume'

const api = (url: string, ts: any) =>
  httpPost(url, { timestamp: ts },
    { headers: { 'Content-Type': 'application/json', } }
  ).then(res => {
    if (res.error)
      throw new Error(res.error.message)

    return res
  });

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.ARBITRUM]: {
      start: 1736328600,
      fetch: async (ts) => {
        const data = await api(API_SERVICE_URL, ts)

        return {
          timestamp: ts,
          dailyVolume: data.daily_volume,
          totalVolume: data.total_volume,
        }
      }
    }
  }
};

export default adapter;
