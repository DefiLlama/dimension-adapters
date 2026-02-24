import type { SimpleAdapter } from '../../adapters/types'
import { httpGet } from '../../utils/fetchURL';
import {CHAIN} from "../../helpers/chains";

const API_SERVICE_URL = 'https://api.cvex.trade/v1/statistics/fee'

const api = async (url: string) => {
  const res = await httpGet(url);
  if (res.error) throw new Error(res.error.message);
  return res;
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.ARBITRUM]: {
      runAtCurrTime: true,
      start: '2025-01-08',
      fetch: async () => {
        const data = await api(API_SERVICE_URL)

        return {
          dailyFees: data.daily_fee,
        }
      }
    }
  }
};

export default adapter;
