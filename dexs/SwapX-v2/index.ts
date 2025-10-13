import { CHAIN } from "../../helpers/chains";
import { uniV2Exports } from "../../helpers/uniswap";

export default uniV2Exports({
  [CHAIN.SONIC]: {
    factory: '0x05c1be79d3aC21Cc4B727eeD58C9B2fF757F5663',
    start: "2024-12-23",
    stableFees: 0.001,
  }
})
