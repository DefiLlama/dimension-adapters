import { CHAIN } from "../../helpers/chains";
import { uniV2Exports } from "../../helpers/uniswap";

export default uniV2Exports({
  [CHAIN.FANTOM]: {
    factory: "0x3fAaB499b519fdC5819e3D7ed0C26111904cbc28",
    fees: 0.0025,    // 0.25% for volatile pairs
    stableFees: 0.0001, // 0.01% for stable pairs
  },
});