import { CHAIN } from "../../helpers/chains";
import { uniV3Exports } from "../../helpers/uniswap";

export default uniV3Exports({
  [CHAIN.SONIC]: {
    factory: '0x8121a3F8c4176E9765deEa0B95FA2BDfD3016794',
    start: "2024-12-24",
    isAlgebraV3: true,
  }
})

