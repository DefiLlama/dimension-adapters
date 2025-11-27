
// import adapter from './balancer'
// const { breakdown,  ...rest } = adapter

// export default {
//   ...rest,
//   adapter: breakdown['v2'],
// }

import { FetchOptions } from '../adapters/types'
import { getFeesExport } from '../helpers/balancer'
import { CHAIN } from '../helpers/chains'

const WhitehatActivitiesChains: Array<string> = [
  CHAIN.ETHEREUM,
  CHAIN.OPTIMISM,
  CHAIN.ARBITRUM,
]

async function fetch(options: FetchOptions) {
  // https://x.com/Balancer/status/1988685056982835470
  if ((options.startOfDay === 1762992000 || options.startOfDay === 1762905600) && WhitehatActivitiesChains.includes(options.chain)) {
    return {
      dailyVolume: 0,
      dailyFees:0,
      dailyRevenue:0,
      dailyProtocolRevenue:0,
      dailySupplySideRevenue:0,
    }
  } else {
    const fetchFunction = getFeesExport('0xBA12222222228d8Ba445958a75a0704d566BF2C8', { revenueRatio: 0.5, protocolRevenueRatio: 0.5 });
    return await fetchFunction(options);
  }
}

export default {
  version: 2,
  fetch: fetch,
  chains: [
    CHAIN.ETHEREUM,
    CHAIN.ARBITRUM,
    CHAIN.AVAX,
    CHAIN.BASE,
    CHAIN.FRAXTAL,
    CHAIN.XDAI,
    CHAIN.MODE,
    CHAIN.OPTIMISM,
    CHAIN.POLYGON,
  ]
}

