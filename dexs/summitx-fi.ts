import { CHAIN } from "../helpers/chains";
import { uniV3Exports } from "../helpers/uniswap";

export default uniV3Exports({ 
  [CHAIN.CAMP]: {
    start: '2025-08-23',
    factory: '0xBa08235b05d06A8A27822faCF3BaBeF4f972BF7d',
    revenueRatio: 0,
    protocolRevenueRatio: 0,
    holdersRevenueRatio: 0,
  }
})
