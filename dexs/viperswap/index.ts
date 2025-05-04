import { CHAIN } from "../../helpers/chains"
import { uniV2Exports } from "../../helpers/uniswap"

const adapter =  uniV2Exports({
  [CHAIN.HARMONY]: { factory: '0x7d02c116b98d0965ba7b642ace0183ad8b8d2196', },
}, { runAsV1: true })
// adapter.deadFrom = '2022-10-06'

export default adapter;