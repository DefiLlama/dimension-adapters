import { CHAIN } from "../../helpers/chains";
import { getUniV2LogAdapter } from "../../helpers/uniswap";
import { SimpleAdapter } from "../../adapters/types";

const config = {
  fees: 0.003,
  userFeesRatio: 1,
  revenueRatio: 0,
}

const adapter: SimpleAdapter = {
  version: 2,
  methodology: {
    Fees: 'Users pay 0.3% per swap.',
    UserFees: 'Users pay 0.3% per swap.',
    Revenue: 'No revenue',
    SupplySideRevenue: 'Swap fees distributed to LPs.',
  },
  adapter: {
    [CHAIN.BSC]: { fetch: getUniV2LogAdapter({ factory: '0x06530550A48F990360DFD642d2132354A144F31d', ...config }) },
    [CHAIN.CRONOS]: { fetch: getUniV2LogAdapter({ factory: '0x06530550A48F990360DFD642d2132354A144F31d', ...config }) },
    [CHAIN.XDAI]: { fetch: getUniV2LogAdapter({ factory: '0x06530550A48F990360DFD642d2132354A144F31d', ...config }) },
    [CHAIN.POLYGON]: { fetch: getUniV2LogAdapter({ factory: '0x06530550A48F990360DFD642d2132354A144F31d', ...config }) },
    [CHAIN.FANTOM]: { fetch: getUniV2LogAdapter({ factory: '0x06530550A48F990360DFD642d2132354A144F31d', ...config }) },
    [CHAIN.AVAX]: { fetch: getUniV2LogAdapter({ factory: '0x06530550A48F990360DFD642d2132354A144F31d', ...config }) },
    [CHAIN.ETHEREUM]: { fetch: getUniV2LogAdapter({ factory: '0xd674b01E778CF43D3E6544985F893355F46A74A5', ...config }) },
    [CHAIN.KAVA]: { fetch: getUniV2LogAdapter({ factory: '0x06530550A48F990360DFD642d2132354A144F31d', ...config }) },
  },
}

export default adapter;
