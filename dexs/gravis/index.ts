import { CHAIN } from "../../helpers/chains";
import { getUniV2LogAdapter } from "../../helpers/uniswap";
import { SimpleAdapter } from "../../adapters/types";

const config = {
  fees: 0.0025,
  userFeesRatio: 1,
  revenueRatio: 0,
}

const adapter: SimpleAdapter = {
  version: 2,
  methodology: {
    Fees: 'Users pay 0.25% per swap.',
    UserFees: 'Users pay 0.25% per swap.',
    Revenue: 'No revenue',
    SupplySideRevenue: 'Swap fees distributed to LPs.',
  },
  adapter: {
    [CHAIN.BSC]: { fetch: getUniV2LogAdapter({ factory: '0x4a3b76860c1b76f0403025485de7bfa1f08c48fd', ...config }) },
    [CHAIN.POLYGON]: { fetch: getUniV2LogAdapter({ factory: '0x17c1d25d5a2d833c266639de5fbe8896bdbeb234', ...config }) },
    // [CHAIN.HECO]: { fetch: getUniV2LogAdapter({ factory: '0x4a3B76860C1b76f0403025485DE7bfa1F08C48fD', ...config }) },
  },
}

export default adapter;
