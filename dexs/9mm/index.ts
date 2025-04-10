import { CHAIN } from "../../helpers/chains";
import { uniV3Exports } from "../../helpers/uniswap";


export default uniV3Exports({
  [CHAIN.PULSECHAIN]: { factory: "0xe50dbdc88e87a2c92984d794bcf3d1d76f619c68" },
  [CHAIN.BASE]: { factory: "0x7b72C4002EA7c276dd717B96b20f4956c5C904E7" },
  [CHAIN.SONIC]: { factory: "0x924aee3929C8A45aC9c41e9e9Cdf3eA761ca75e5" },
});