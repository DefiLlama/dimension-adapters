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
    [CHAIN.BSC]: { fetch: getUniV2LogAdapter({ factory: '0x8BA1a4C24DE655136DEd68410e222cCA80d43444', ...config }) },
    [CHAIN.CRONOS]: { fetch: getUniV2LogAdapter({ factory: '0x5019EF5dd93A7528103BB759Bb2F784D065b826a', ...config }) },
  },
}

export default adapter;
