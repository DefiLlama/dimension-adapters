import { CHAIN } from "../helpers/chains";
import { uniV2Exports } from "../helpers/uniswap";

export default uniV2Exports({
  [CHAIN.CHILIZ]: {
    factory: '0xE2918AA38088878546c1A18F2F9b1BC83297fdD3',
    start: '2024-04-01',
    revenueRatio: 0.5,
    protocolRevenueRatio: 0.5,
    holdersRevenueRatio: 0,
  },
});