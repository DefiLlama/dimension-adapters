import { CHAIN } from "../../helpers/chains";
import { getUniV2LogAdapter } from "../../helpers/uniswap";
import { SimpleAdapter } from "../../adapters/types";

const config = {
  fees: 0.002,
  userFeesRatio: 1,
  revenueRatio: 0,
}

const adapter: SimpleAdapter = {
  version: 2,
  methodology: {
    Fees: 'Users pay 0.2% per swap.',
    UserFees: 'Users pay 0.2% per swap.',
    Revenue: 'No revenue',
    SupplySideRevenue: 'Swap fees distributed to LPs.',
  },
  adapter: {
    [CHAIN.AVAX]: { fetch: getUniV2LogAdapter({ factory: '0x2Db46fEB38C57a6621BCa4d97820e1fc1de40f41', ...config }) },
  },
}

export default adapter;
