import { CHAIN } from "../helpers/chains";
import { uniV2Exports } from "../helpers/uniswap";

export default uniV2Exports({
  [CHAIN.MODE]: {
    factory: '0xfb926356BAf861c93C3557D7327Dbe8734A71891',
    start: '2024-02-02',
    userFeesRatio: 1,
    revenueRatio: 0.8, // 80% fees
    protocolRevenueRatio: 0.8,

  },
}, { runAsV1: true })

// import adapter from './swapmode'
// const { breakdown,  ...rest } = adapter


// export default {
//   ...rest,
//   adapter: breakdown['v2'],
// }
