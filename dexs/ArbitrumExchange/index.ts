import { BreakdownAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniV2LogAdapter, getUniV3LogAdapter } from "../../helpers/uniswap";


const adapter: BreakdownAdapter = {
  version: 2,
  breakdown: {
    v2: {
      [CHAIN.ARBITRUM]: {
        fetch: getUniV2LogAdapter({ factory: '0x1C6E968f2E6c9DEC61DB874E28589fd5CE3E1f2c' }),
      },
    },
    v3: {
      [CHAIN.ARBITRUM]: {
        fetch: getUniV3LogAdapter({ factory: '0x855f2c70cf5cb1d56c15ed309a4dfefb88ed909e' }),
        start: '2023-05-09',
      },
    },
  },
}

export default adapter;
