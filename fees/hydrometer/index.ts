import { CHAIN } from "../../helpers/chains"
import { uniV2Exports } from "../../helpers/uniswap";

const swapEvent = 'event Swap(address indexed sender, address indexed to, uint256 amount0In, uint256 amount1In, uint256 amount0Out, uint256 amount1Out)'

export default uniV2Exports({
  [CHAIN.BASE]: { factory: '0xF60caCf0A3daa5B6a79ca6594BEF38F85391AE0A', swapEvent, voter: '0x0207F9fee1e4F787f7d9F07d07401199cBb27a3F', maxPairSize: 65, },
})
