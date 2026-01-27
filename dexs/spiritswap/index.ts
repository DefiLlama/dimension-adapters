import { CHAIN } from '../../helpers/chains'
import { uniV2Exports } from '../../helpers/uniswap'

export default uniV2Exports({
  [CHAIN.FANTOM]: { factory: '0xEF45d134b73241eDa7703fa787148D9C9F4950b0', start: '2021-05-13', fees: 0.003, revenueRatio: 0.0005 / 0.003, protocolRevenueRatio: 0.0005 / 0.003 },
})