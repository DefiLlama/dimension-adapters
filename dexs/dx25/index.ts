import type { SimpleAdapter } from '../../adapters/types'
import { CHAIN } from "../../helpers/chains";
import { httpPost } from '../../utils/fetchURL';

const POOLS_SERVICE_URL = 'https://liquidity-pool.dx25.com/v1/rpc'

const rpc = (url: string, method: string, params: any) =>
  httpPost(url, { jsonrpc: '2.0', method, params, id: '0', },
    { headers: { 'Content-Type': 'application/json', } })
    .then(res => {
      if (res.error) {
        throw new Error(res.error.message)
      }
      return res.result
    });



const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.ELROND]: {
      start: '2023-10-16',
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
