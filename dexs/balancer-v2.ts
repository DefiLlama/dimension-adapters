
// import adapter from './balancer'
// const { breakdown,  ...rest } = adapter

// export default {
//   ...rest,
//   adapter: breakdown['v2'],
// }

import { getFeesExport } from '../helpers/balancer'
import { CHAIN } from '../helpers/chains'

export default {
  version: 2,
  fetch: getFeesExport('0xBA12222222228d8Ba445958a75a0704d566BF2C8', { revenueRatio: 0.5, protocolRevenueRatio: 0.5 }),
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

