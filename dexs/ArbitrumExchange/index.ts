import { BreakdownAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniV2LogAdapter, getUniV3LogAdapter } from "../../helpers/uniswap";


const methodology = {
  UserFees: "User pays 0.25% fees on each swap.",
  ProtocolRevenue: "No protocol revenue.",
  SupplySideRevenue: "LPs have no revenue.",
  HoldersRevenue: "ARX stakers receive all fees."
}

const adapter: BreakdownAdapter = {
  version: 2,
  breakdown: {
    v2: {
      [CHAIN.ARBITRUM]: {
        fetch: getUniV2LogAdapter({ factory: '0x1C6E968f2E6c9DEC61DB874E28589fd5CE3E1f2c' }),
        meta: {
          methodology
        },
      },
    },
    v3: {
      [CHAIN.ARBITRUM]: {
        fetch: getUniV3LogAdapter({ factory: '0x855f2c70cf5cb1d56c15ed309a4dfefb88ed909e' }),
        start: 1683590400,
        meta: {
          methodology: {
            ...methodology,
            UserFees: "User pays a variable percentage on each swap depending on the pool. Minimum: 0.008%, maximum: 1%."
          }
        }
      },
    },
  },
}

export default adapter;
