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
    [CHAIN.BSC]: { fetch: getUniV2LogAdapter({ factory: '0xe759Dd4B9f99392Be64f1050a6A8018f73B53a13', ...config }) },
  },
}

export default adapter;
