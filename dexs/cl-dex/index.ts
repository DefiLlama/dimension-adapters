import { CHAIN } from "../../helpers/chains";
import { uniV2Exports } from "../../helpers/uniswap";

// total swap fee is 0.3%. And 0.21% goes to LP, while 0.09% goes to the protocol

export default uniV2Exports({
  [CHAIN.KLAYTN]: {
    factory: "0x2A4C5eCaafB26460F17d509EA4d15741AF5F5f0a",
    userFeesRatio: 1,
    protocolRevenueRatio: 0.3,
    revenueRatio: 0.3,
    holdersRevenueRatio: 0,
  },
});
