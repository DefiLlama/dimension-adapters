import { CHAIN } from "../../helpers/chains";
import { uniV2Exports } from "../../helpers/uniswap";

export default uniV2Exports({
  [CHAIN.FANTOM]: { factory: '0xc6366efd0af1d09171fe0ebf32c7943bb310832a', },
  [CHAIN.SONIC]: { factory: '0xDDD9845Ba0D8f38d3045f804f67A1a8B9A528FcC', },
})
