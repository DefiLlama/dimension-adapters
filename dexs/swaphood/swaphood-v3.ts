import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { uniV3Exports } from "../../helpers/uniswap";

const FACTORY = "0x0Ec554F0BfF0Be6C99d1e95C8015bb0950f6A2C7";
const START = "2026-07-10";

const adapter: SimpleAdapter = uniV3Exports(
  {
    [CHAIN.ROBINHOOD]: {
      factory: FACTORY,
      start: START,
    },
  },
  {
    methodology: {
      Volume:
        "Swap volume from SwapHood V3 pools on Robinhood Chain, calculated from PancakeSwap V3-compatible Swap events.",
    },
  },
);

export default adapter;
