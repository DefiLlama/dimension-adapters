import { CHAIN } from "../helpers/chains";
import { uniV2Exports } from "../helpers/uniswap";

export default uniV2Exports({
  [CHAIN.CHILIZ]: {
    factory: '0xBDd9c322Ecf401E09C9D2Dca3be46a7E45d48BB1',
    start: '2024-04-08',
    revenueRatio: 0.3,
    protocolRevenueRatio: 0.3,
    holdersRevenueRatio: 0,
  },
});
