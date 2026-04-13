import { SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getUniV2LogAdapter } from "../helpers/uniswap";

const swapEvent = 'event Swap(address indexed sender, uint amount0In, uint amount1In, uint amount0Out, uint amount1Out, address indexed to, bool isDiscountEligible)'

const FACTORY = '0x98Bb580A77eE329796a79aBd05c6D2F2b3D5E1bD'

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.KASPLEX]: {
      fetch: getUniV2LogAdapter({ factory: FACTORY, swapEvent, fees: 0.003 }),
    },
    [CHAIN.IGRA]: {
      fetch: getUniV2LogAdapter({ factory: FACTORY, swapEvent, fees: 0.003 }),
    },
  },
};

export default adapter;
