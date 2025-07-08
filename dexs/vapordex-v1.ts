import { CHAIN } from '../helpers/chains'
import { uniV2Exports } from '../helpers/uniswap'

export default uniV2Exports({
  [CHAIN.AVAX]: { factory: '0xc009a670e2b02e21e7e75ae98e254f467f7ae257', },
  // [CHAIN.TELOS]: { factory: '0xDef9ee39FD82ee57a1b789Bc877E2Cbd88fd5caE', },
  [CHAIN.APECHAIN]: { factory: '0xc009a670e2b02e21e7e75ae98e254f467f7ae257', },
})