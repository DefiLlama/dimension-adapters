import { uniV2Exports } from "../../helpers/uniswap";
import { CHAIN } from "../../helpers/chains";

export default uniV2Exports({
  [CHAIN.INK]: {
    factory: "0x2ebE0528aDED9fA8d745B7C7082fb90d7C7B6Ec8",
    fees: 0.003,
    revenueRatio: 0,
    userFeesRatio: 1,
    start: "2025-02-22",
  },
});
