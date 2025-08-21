import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniV2LogAdapter } from "../../helpers/uniswap";

const adapter: SimpleAdapter = {
  version: 2,
  methodology: {
    Fees: 'Users pay 0.3% per swap.',
    UserFees: 'Users pay 0.3% per swap.',
    SupplySideRevenue: 'Swap fees distributed to LPs.',
  },
  adapter: {
    [CHAIN.AVAX]: {
      fetch: getUniV2LogAdapter({ factory: '0x9c60c867ce07a3c403e2598388673c10259ec768', userFeesRatio: 1, revenueRatio: 0 })
    },
    [CHAIN.POLYGON]: {
      fetch: getUniV2LogAdapter({ factory: '0x735ab9808d792B5c8B54e31196c011c26C08b4ce', userFeesRatio: 1, revenueRatio: 0 })
    },
    [CHAIN.BSC]: {
      fetch: getUniV2LogAdapter({ factory: '0xEe673452BD981966d4799c865a96e0b92A8d0E45', userFeesRatio: 1, revenueRatio: 0 })
    },
    [CHAIN.FANTOM]: {
      fetch: getUniV2LogAdapter({ factory: '0x98F23162E3a7FE610aC89C88E4217a599A15858F', userFeesRatio: 1, revenueRatio: 0 })
    },
    [CHAIN.ARBITRUM]: {
      fetch: getUniV2LogAdapter({ factory: '0x2f0c7c98462651bb2102f6cd05acdad333e031b0', userFeesRatio: 1, revenueRatio: 0 })
    },
    [CHAIN.ETHEREUM]: {
      fetch: getUniV2LogAdapter({ factory: '0x2f0c7c98462651bb2102f6cd05acdad333e031b0', userFeesRatio: 1, revenueRatio: 0 })
    },
    [CHAIN.OPTIMISM]: {
      fetch: getUniV2LogAdapter({ factory: '0x2f0c7c98462651bb2102f6cd05acdad333e031b0', userFeesRatio: 1, revenueRatio: 0 })
    },
    [CHAIN.TELOS]: {
      fetch: getUniV2LogAdapter({ factory: '0xB630F53DF13645BFF0Ef55eB44a8a490a7DD4514', userFeesRatio: 1, revenueRatio: 0 })
    },
  },
}

export default adapter;