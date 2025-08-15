import { CHAIN } from "../../helpers/chains";
import { SimpleAdapter } from "../../adapters/types";
import { getUniV2LogAdapter } from "../../helpers/uniswap";

const adapter: SimpleAdapter = {
  version: 2,
  methodology: {
    Fees: 'Users pay 0.3% per swap for most of pairs, 0.01% for stable pairs.',
    UserFees: 'Users pay 0.3% per swap for most of pairs, 0.01% for stable pairs.',
    Revenue: 'No revenue.',
    SupplySideRevenue: 'Swap fees distributed to LPs.',
  },
  fetch: getUniV2LogAdapter({ factory: '0xe9c29cB475C0ADe80bE0319B74AD112F1e80058F', userFeesRatio: 1, revenueRatio: 0 }),
  chains: [CHAIN.CRONOS],
  start: '2021-12-01',
}

export default adapter;
