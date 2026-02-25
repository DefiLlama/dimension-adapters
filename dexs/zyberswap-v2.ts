import { uniV2Exports } from "../helpers/uniswap";
import { CHAIN } from "../helpers/chains";

export default uniV2Exports({
  [CHAIN.ARBITRUM]: { factory: '0xaC2ee06A14c52570Ef3B9812Ed240BCe359772e7', start: '2023-01-23', fees: 0.0025, protocolRevenueRatio: 0.1, revenueRatio: 0.1, },
})
