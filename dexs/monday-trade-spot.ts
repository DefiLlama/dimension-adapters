import { CHAIN } from "../helpers/chains";
import { uniV3Exports } from "../helpers/uniswap";

export default uniV3Exports({ 
  [CHAIN.MONAD]: {
    factory: '0xc1e98d0a2a58fb8abd10ccc30a58efff4080aa21',
    start: "2025-11-13",
  }
})
