import { CHAIN } from "../helpers/chains";
import { uniV3Exports } from "../helpers/uniswap";

export default uniV3Exports({
  [CHAIN.MODE]: {
    factory: '0x6E36FC34eA123044F278d3a9F3819027B21c9c32',
    start: '2024-03-13',
    userFeesRatio: 1,
    revenueRatio: 0.64, // 64% fees
    protocolRevenueRatio: 0.64,

  },
}, { runAsV1: true })

// import adapter from './swapmode'
// const { breakdown,  ...rest } = adapter


// export default {
//   ...rest,
//   adapter: breakdown['v3'],
// }
