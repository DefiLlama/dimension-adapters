import { CHAIN } from "../../helpers/chains";
import { SimpleAdapter } from "../../adapters/types";
import { getUniV2LogAdapter } from "../../helpers/uniswap";

const adapter: SimpleAdapter = {
  version: 2,
  methodology: {
    Fees: 'Users pay 0.18% per swap for most of pairs, 0.04% for stable pairs.',
    UserFees: 'Users pay 0.18% per swap for most of pairs, 0.04% for stable pairs.',
    Revenue: 'Protocol collects all swap fees.',
    ProtocolRevenue: 'Protocol collects all swap fees.',
    SupplySideRevenue: 'No swap fees are distributed to LPs.',
  },
  fetch: getUniV2LogAdapter({ factory: '0xdd018347c29a27088eb2d0bf0637d9a05b30666c', fees: 0.0018, stableFees: 0.0004, userFeesRatio: 1, revenueRatio: 1, protocolRevenueRatio: 1 }),
  chains: [CHAIN.ZIRCUIT],
  start: '2024-10-25',
}

export default adapter;