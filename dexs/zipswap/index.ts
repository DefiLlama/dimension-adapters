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
    [CHAIN.ARBITRUM]: { fetch: getUniV2LogAdapter({ factory: '0x9e343Bea27a12B23523ad88333a1B0f68cc1F05E', ...config }) },
    // [CHAIN.OPTIMISM]: { fetch: getUniV2LogAdapter({ factory: '0x8BCeDD62DD46F1A76F8A1633d4f5B76e0CDa521E', ...config }) },
  },
}

export default adapter;
