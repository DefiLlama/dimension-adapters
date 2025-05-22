import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniV3LogAdapter } from "../../helpers/uniswap";

const swapEvent = 'event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint128 protocolFeesToken0, uint128 protocolFeesToken1)'

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.BASE]: { fetch: getUniV3LogAdapter({ factory: '0x3D237AC6D2f425D2E890Cc99198818cc1FA48870', swapEvent, }) },
    [CHAIN.OPTIMISM]: { fetch: getUniV3LogAdapter({ factory: '0xc2BC7A73613B9bD5F373FE10B55C59a69F4D617B', swapEvent, }) },
    [CHAIN.ARBITRUM]: { fetch: getUniV3LogAdapter({ factory: '0xaedc38bd52b0380b2af4980948925734fd54fbf4', swapEvent, }) },
    [CHAIN.BLAST]: { fetch: getUniV3LogAdapter({ factory: '0xCFC8BfD74422472277fB5Bc4Ec8851d98Ecb2976', swapEvent, }) },
    [CHAIN.MODE]: { fetch: getUniV3LogAdapter({ factory: '0xc6f3966E5D08Ced98aC30f8B65BeAB5882Be54C7', swapEvent, }) },
    [CHAIN.LINEA]: { fetch: getUniV3LogAdapter({ factory: '0xc6255ec7CDb11C890d02EBfE77825976457B2470', swapEvent, }) },
    [CHAIN.XLAYER]: { fetch: getUniV3LogAdapter({ factory: '0xc6f3966e5d08ced98ac30f8b65beab5882be54c7', swapEvent, }) },
  },
  version: 2
};

export default adapter;
