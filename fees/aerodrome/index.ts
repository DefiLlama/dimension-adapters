import { CHAIN } from "../../helpers/chains"
import { uniV2Exports } from "../../helpers/uniswap";

const swapEvent = 'event Swap(address indexed sender, address indexed to, uint256 amount0In, uint256 amount1In, uint256 amount0Out, uint256 amount1Out)'

export default uniV2Exports({
  [CHAIN.BASE]: { factory: '0x420DD381b31aEf6683db6B902084cB0FFECe40Da', swapEvent, voter: '0x16613524e02ad97eDfeF371bC883F2F5d6C480A50', maxPairSize: 65, },
})
