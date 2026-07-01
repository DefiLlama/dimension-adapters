import { CHAIN } from "../helpers/chains";
import { uniV3Exports } from "../helpers/uniswap";

// Bond — Uniswap V3 fork on 0G
// Factory (same address used by the Bond TVL adapter in DefiLlama-Adapters,
// registries/uniswapV3.js): https://chainscan.0g.ai/address/0xBDDB3aCF0A90029a1e7ebC3F82C7D9391C429A75
export default uniV3Exports({
  [CHAIN.OG]: {
    factory: "0xBDDB3aCF0A90029a1e7ebC3F82C7D9391C429A75",
    start: "2026-05-09",
    userFeesRatio: 1,
    revenueRatio: 0,
    protocolRevenueRatio: 0,
    holdersRevenueRatio: 0,
  },
});
