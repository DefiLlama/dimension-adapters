import { CHAIN } from "../../helpers/chains";
import { uniV2Exports } from "../../helpers/uniswap";

const FACTORY_ADDRESS = '0xCe9240869391928253Ed9cc9Bcb8cb98CB5B0722';

export default uniV2Exports({
  [CHAIN.ARBITRUM]: { factory: FACTORY_ADDRESS, },
})

