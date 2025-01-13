import type { SimpleAdapter } from '../../adapters/types'
import { httpGet } from '../../utils/fetchURL';
import {CHAIN} from "../../helpers/chains";

const API_SERVICE_URL = 'https://api.cvex.trade/v1/statistics/fee'

const buildUrl = (baseUrl: string, params: Record<string, any>) => {
  const query = new URLSearchParams(params).toString();
  return `${baseUrl}?${query}`;
};

const api = (url: string, ts: any) => {
  const fullUrl = buildUrl(url, { timestamp: ts });
  return httpGet(fullUrl).then(res => {
    if (res.error) throw new Error(res.error.message);
    return res;
  });
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.ARBITRUM]: {
      start: 1736328600,
      fetch: async (ts) => {
        const data = await api(API_SERVICE_URL, ts)

        return {
          timestamp: ts,
          dailyFees: data.daily_fee,
          totalFees: data.total_fee,
        }
      }
    }
  }
};

export default adapter;
