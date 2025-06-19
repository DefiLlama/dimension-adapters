import type { SimpleAdapter } from '../../adapters/types'
import { httpGet } from '../../utils/fetchURL';
import { CHAIN } from "../../helpers/chains";

const API_SERVICE_URL = 'https://api.cvex.trade/v1/statistics/volume'

const api = async (url: string) => {
  const res = await httpGet(url);
  if (res.error) throw new Error(res.error.message);
  return res;
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.ARBITRUM]: {
      start: '2025-01-08',
      runAtCurrTime: true,
      fetch: async () => {
        const data = await api(API_SERVICE_URL)

        return {
          dailyVolume: data.daily_volume,
        }
      }
    }
  }
};

export default adapter;
