import { ChainBlocks, FetchOptions } from '../../adapters/types';
import { httpPost } from "../../utils/fetchURL";

async function last24h(timestamp: number, _: ChainBlocks, { createBalances }: FetchOptions) {
  const { data: { pools } } = await httpPost('https://saberqltest.aleph.cloud/', { "query": "{  pools {    stats  { vol24h_usd    }  }  }" })
  const dailyVolume = createBalances()
  pools.forEach((pool: any) => dailyVolume.addCGToken('tether', pool.stats.vol24h_usd))
  return {
    dailyVolume,
    timestamp: Math.floor(Date.now() / 1e3)
  }
}

export default {
  adapter: {
    "solana": {
      fetch: last24h,
      runAtCurrTime: true,
      start: 0,
    }
  }
}
