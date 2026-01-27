import { CHAIN } from '../../helpers/chains'
import { uniV2Exports } from '../../helpers/uniswap'

export default uniV2Exports({
  [CHAIN.ARBITRUM]: { factory: '0xD158bd9E8b6efd3ca76830B66715Aa2b7Bad2218', start: '2022-11-06' },
})