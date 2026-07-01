import { CHAIN } from "../helpers/chains";
import { uniV3Exports } from "../helpers/uniswap";

// JAINE — Uniswap V3 fork on 0G
// Factory (same address used by the JAINE TVL adapter in DefiLlama-Adapters,
// registries/uniswapV3.js): https://chainscan.0g.ai/address/0x9bdcA5798E52e592A08e3b34d3F18EeF76Af7ef4
export default uniV3Exports({
  [CHAIN.OG]: {
    factory: "0x9bdcA5798E52e592A08e3b34d3F18EeF76Af7ef4",
    start: "2025-09-20",
    userFeesRatio: 1,
    revenueRatio: 0,
    protocolRevenueRatio: 0,
    holdersRevenueRatio: 0,
  },
});
