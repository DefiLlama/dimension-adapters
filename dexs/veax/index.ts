import type { SimpleAdapter } from '../../adapters/types'
import { httpPost } from '../../utils/fetchURL';

const POOLS_SERVICE_URL = 'https://veax-liquidity-pool.veax.com/v1/rpc'

const rpc = (url: string, method: string, params: any) =>
  httpPost(url, { jsonrpc: '2.0', method, params, id: '0', },
    { headers: { 'Content-Type': 'application/json', } }
  ).then(res => {
    if (res.error)
      throw new Error(res.error.message)

    return res.result
  });

const adapter: SimpleAdapter = {
  adapter: {
    near: {
      start: 1682607600,
      fetch: async (ts) => {
        const data = await rpc(POOLS_SERVICE_URL, 'volumes_statistic', {
          timestamp: ts,
        })
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
