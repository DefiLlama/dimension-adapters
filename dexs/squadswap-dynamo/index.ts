import { CHAIN } from "../../helpers/chains";
import { uniV2Exports } from "../../helpers/uniswap";

export default uniV2Exports({
  [CHAIN.BSC]: {
    factory: "0x918Adf1f2C03b244823Cd712E010B6e3CD653DbA",
    userFeesRatio: 1,
    revenueRatio: 0.1,
    protocolRevenueRatio: 0.1,
  },
});
