import { CHAIN } from "../../helpers/chains";
import { SimpleAdapter } from "../../adapters/types";
import { getUniV2LogAdapter } from "../../helpers/uniswap";

const adapter: SimpleAdapter = {
  version: 2,
  methodology: {
    Fees: 'Users pay 0.3% fees per swap.',
    UserFees: 'Users pay 0.3% fees per swap.',
    Revenue: 'No protocol revenue.',
    SupplySideRevenue: 'Swap fees distributed to LPs.',
  },
  fetch: getUniV2LogAdapter({ factory: '0x05CDC3ec49C623dCE7947172fECFc5d3cD8d16cD', userFeesRatio: 1, revenueRatio: 0 }),
  chains: [CHAIN.MODE],
  start: '2021-09-26',
  deadFrom: '2024-06-01',
}

export default adapter;
