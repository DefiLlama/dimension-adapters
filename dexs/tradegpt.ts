import { CHAIN } from "../helpers/chains";
import { uniV3Exports } from "../helpers/uniswap";

// TradeGPT — Uniswap V3 fork on 0G
export default uniV3Exports({
  [CHAIN.OG]: {
    factory: "0x6F3945Ab27296D1D66D8EEb042ff1B4fb2E0CE70",
    start: "2025-09-19",
    userFeesRatio: 1,
    revenueRatio: 0,
    protocolRevenueRatio: 0,
    holdersRevenueRatio: 0,
  },
});
