import { uniV3Exports } from "../helpers/uniswap";
import { CHAIN } from "../helpers/chains";

export default uniV3Exports({
  [CHAIN.MOONBEAM]: {
    factory: "0xD118fa707147c54387B738F54838Ea5dD4196E71",
    revenueRatio: 0.18,
    protocolRevenueRatio: 0.16,
    holdersRevenueRatio: 0.02,
    userFeesRatio: 1,
    start: "2023-05-18",
  },
});
