import axios from 'axios'
import type { SimpleAdapter } from '../../adapters/types'
import { CHAIN } from "../../helpers/chains";

const POOLS_SERVICE_URL = 'https://liquidity-pool.dx25.com/v1/rpc'

const rpc = (url: string, method: string, params: any) =>
  axios.post(
    url,
    {
      jsonrpc: '2.0',
      method,
      params,
      id: '0',
    },
    {
      headers: {
        'Content-Type': 'application/json',
      }
    }
  )
    .then(res => {
      if (res.data.error) {
        throw new Error(res.data.error.message)
      }
      return res.data.result
    });



const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.ELROND]: {
      start: async () => 1697414400,
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
