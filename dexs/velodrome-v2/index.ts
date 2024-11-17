import { CHAIN } from "../../helpers/chains";
import { uniV2Exports } from "../../helpers/uniswap";
const swapEvent = 'event Swap(address indexed sender, address indexed to, uint256 amount0In, uint256 amount1In, uint256 amount0Out, uint256 amount1Out)';

export default uniV2Exports({
  [CHAIN.OPTIMISM]: { factory: '0xF1046053aa5682b4F9a81b5481394DA16BE5FF5a',  swapEvent, },
})
