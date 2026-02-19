import { CHAIN } from "../../helpers/chains";
import { uniV2Exports } from "../../helpers/uniswap";

export default uniV2Exports({
  [CHAIN.MONAD]: {
    factory: '0x6DBb0b5B201d02aD74B137617658543ecf800170',
    start: '2026-02-11',
    stableFees: 0.0004,
    revenueRatio: 1,
    protocolRevenueRatio: 0.1,
    holdersRevenueRatio: 0.9,
    userFeesRatio: 1,
  },
});
