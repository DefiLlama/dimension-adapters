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
    [CHAIN.BSC]: { fetch: getUniV2LogAdapter({ factory: '0x73d9f93d53505cb8c4c7f952ae42450d9e859d10', ...config }) },
  },
}

export default adapter;
