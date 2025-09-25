import type { SimpleAdapter } from '../adapters/types'
import { httpPost } from '../utils/fetchURL';

const POOLS_SERVICE_URL = 'https://veax-liquidity-pool.veax.com/v1/rpc'
const reqBody = {
  "jsonrpc": "2.0",
  "method": "liquidity_pools_list",
  "params": {
    "filter": { "sort": "LP_FEE_24H", "page": 1, "is_desc": true, "search": "", "limit": 1000 }
  },
  "id": 0
}

const rpc = (url: string) =>
  httpPost(url, reqBody, { headers: { 'Content-Type': 'application/json', } }
  ).then(res => {
    if (res.error)
      throw new Error(res.error.message)

    return res.result
  });

const adapter: SimpleAdapter = {
  adapter: {
    near: {
      runAtCurrTime: true,
      start: '2023-04-27',
      fetch: async () => {
        const data = await rpc(POOLS_SERVICE_URL)
        const dailyFees = data.pools.reduce((acc: number, pool: any) => {
          return acc + +pool.lp_fee_24h
        }, 0)
        return { dailyFees }
      }
    }
  }
};

export default adapter;
