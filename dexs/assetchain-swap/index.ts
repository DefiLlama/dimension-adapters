import { Adapter, ProtocolType } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains"
import { uniV3Exports } from "../../helpers/uniswap";

const swapEvent = 'Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)'

export default uniV3Exports({
    [CHAIN.ASSETCHAIN]: { factory: '0xa9d53862D01190e78dDAf924a8F497b4F8bb5163' },
})
