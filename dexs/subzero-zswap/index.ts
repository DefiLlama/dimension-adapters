import { CHAIN } from "../../helpers/chains";
import { SimpleAdapter } from "../../adapters/types";
import { getUniV2LogAdapter } from "../../helpers/uniswap";

const adapter: SimpleAdapter = {
  version: 2,
  methodology: {
    Fees: 'Users pay 0.25% per swap.',
    UserFees: 'Users pay 0.25% per swap.',
    SupplySideRevenue: 'Swap fees distributed to LPs.',
  },
  fetch: getUniV2LogAdapter({ factory: '0xcDE3F9e6D452be6d955B1C7AaAEE3cA397EAc469', fees: 0.0025, userFeesRatio: 1, revenueRatio: 0 }),
  chains: [CHAIN.AVAX],
  start: 1675814400,
}

export default adapter;
