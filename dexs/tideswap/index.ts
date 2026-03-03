// TideSwap DEX Volume Adapter
// Repo: DefiLlama/dimension-adapters
// Path: dexs/tideswap/index.ts
//
// Tracks swap volume from TideSwap's Uniswap V2 AMM pools on Ink.

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
