import { CHAIN } from "../../helpers/chains";
import { getUniV2LogAdapter } from "../../helpers/uniswap";
import { SimpleAdapter } from "../../adapters/types";
import { METRIC } from "../../helpers/metrics";

const config = {
  fees: 0.003,
  userFeesRatio: 1,
  revenueRatio: 0,
}

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.BSC]: {
      fetch: getUniV2LogAdapter({ factory: '0xe759Dd4B9f99392Be64f1050a6A8018f73B53a13', ...config }),
      start: '2021-04-01',
    },
  },
  methodology: {
    Fees: 'Users pay 0.3% per swap.',
    UserFees: 'Users pay 0.3% per swap.',
    Revenue: 'No revenue',
    SupplySideRevenue: 'Swap fees distributed to LPs.',
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.SWAP_FEES]: 'All swap fees (0.3% of trading volume) charged on token swaps',
    },
    UserFees: {
      [METRIC.SWAP_FEES]: 'All swap fees (0.3% of trading volume) paid by users on each token swap',
    },
    SupplySideRevenue: {
      [METRIC.LP_FEES]: 'All swap fees (0.3% of trading volume) distributed to liquidity providers',
    },
  },
}

export default adapter;
