import { CHAIN } from "../../helpers/chains";
import { uniV2Exports } from "../../helpers/uniswap";

export default uniV2Exports({
  [CHAIN.FANTOM]: {
    factory: '0xc5bc174cb6382fbab17771d05e6a918441deceea',
  },
  [CHAIN.BSC]: {
    factory: '0x542b6524abf0bd47dc191504e38400ec14d0290c',
  },
  [CHAIN.ETHEREUM]: {
    factory: '0x773cadc167deafa46f603d96172fa45686c4fa58',
  },
})
