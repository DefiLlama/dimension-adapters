import { CHAIN } from "../helpers/chains";
import { uniV3Exports } from "../helpers/uniswap";

export default uniV3Exports({
  [CHAIN.FUSE]: {
    factory: "0xccEdb990abBf0606Cf47e7C6A26e419931c7dc1F",
    isAlgebraV3: true,
  },
})
