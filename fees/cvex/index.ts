import type { SimpleAdapter } from '../../adapters/types'
import { httpGet } from '../../utils/fetchURL';
import {CHAIN} from "../../helpers/chains";

const API_SERVICE_URL = 'https://api.cvex.trade/v1/statistics/fee'

const getStartOfDayUTC = (): number => {
  const now = new Date();
  const startOfDay = Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      0, 0, 0, 0
  );
  return Math.floor(startOfDay / 1000);
};

const api = async (url: string) => {
  const res = await httpGet(url);
  if (res.error) throw new Error(res.error.message);
  return res;
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.ARBITRUM]: {
      start: 1736328600,
      fetch: async () => {
        const data = await api(API_SERVICE_URL)

        return {
          timestamp: getStartOfDayUTC(),
          dailyFees: data.daily_fee,
          totalFees: data.total_fee,
        }
      }
    }
  }
};

export default adapter;
