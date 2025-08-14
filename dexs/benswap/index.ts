import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniV2LogAdapter } from "../../helpers/uniswap";

// https://docs.benswap.cash/features/amm
const adapter: SimpleAdapter = {
  version: 2,
  methodology: {
    Fees: 'Users pay 0.2% per swap.',
    UserFees: 'Users pay 0.2% per swap.',
    Revenue: 'Protocol collects 25% swap fees.',
    ProtocolRevenue: 'Protocol collects 25% swap fees.',
    SupplySideRevenue: '75% swap fees distributed to LPs.',
  },
  adapter: {
    [CHAIN.BSC]: { fetch: getUniV2LogAdapter({ factory: '0x4dC6048552e2DC6Eb1f82A783E859157d40FA193', fees: 0.002, userFeesRatio: 1, revenueRatio: 0.25, protocolRevenueRatio: 0.25 }) },
    [CHAIN.SMARTBCH]: { fetch: getUniV2LogAdapter({ factory: '0x8d973bAD782c1FFfd8FcC9d7579542BA7Dd0998D', fees: 0.002, userFeesRatio: 1, revenueRatio: 0.25, protocolRevenueRatio: 0.25 }) },
  },
}

export default adapter;
