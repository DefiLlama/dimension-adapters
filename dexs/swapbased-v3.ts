import { SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getUniV3LogAdapter } from "../helpers/uniswap";

const adapter: SimpleAdapter = {
  version: 1,
  adapter: {
    [CHAIN.BASE]: {
      fetch: async (_a: any, _b: any, options: any) =>
        getUniV3LogAdapter({
          factory: "0xb5620F90e803C7F957A9EF351B8DB3C746021BEa",
          swapEvent:
            "event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint128 protocolFeesToken0, uint128 protocolFeesToken1)",
        })(options),
      start: "2023-07-27",
    },
  },
};

export default adapter;
