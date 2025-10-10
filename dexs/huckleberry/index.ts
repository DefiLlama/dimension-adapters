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
  fetch: getUniV2LogAdapter({ factory: '0x017603C8f29F7f6394737628a93c57ffBA1b7256', userFeesRatio: 1, revenueRatio: 0 }),
  chains: [CHAIN.MOONRIVER],
  start: '2021-09-26',
}

export default adapter;
