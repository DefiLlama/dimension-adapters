import { CHAIN } from "../../helpers/chains"
import { uniV2Exports } from "../../helpers/uniswap"

export default uniV2Exports({
  [CHAIN.ETHEREUM]: {
    factory: '0x115934131916c8b277dd010ee02de363c09d037c',
  },
  [CHAIN.SHIBARIUM]: {
    factory: '0xc2b4218F137e3A5A9B98ab3AE804108F0D312CBC',
    start: '5-15-24'
  }
})