import { CHAIN } from "../../helpers/chains"
import { getUniV2LogAdapter } from "../../helpers/uniswap"

export default {
  version: 2,
  adapter: {
    [CHAIN.ERA]: {
      fetch: getUniV2LogAdapter({
        factory: '0xeeE1Af1CE68D280e9cAfD861B7d4af776798F18d',

        // https://docs.zkswap.finance/highlights/fee#classic-pools-uniswap-v2-style
        userFeesRatio: 1,
        revenueRatio: 1, // 100% swap fees
        protocolRevenueRatio: 1, // 100% swap fees
      }),
    }
  },
  methodology: {
    Fees: "Total swap fees paided by users.",
    Revenue: "Revenue collected from 100% swap fees.",
    ProtocolRevenue: "Revenue for HyperSwap from 100% swap fees.",
    SupplySideRevenue: "No fees distributed to LPs.",
    UserFees: "Total swap fees paided by users."
  }
}
