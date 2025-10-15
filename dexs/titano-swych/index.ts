import { CHAIN } from "../../helpers/chains";
import { SimpleAdapter } from "../../adapters/types";
import { getUniV2LogAdapter } from "../../helpers/uniswap";

const adapter: SimpleAdapter = {
  version: 2,
  methodology: {
    Fees: 'Users pay 0.25% per swap.',
    UserFees: 'Users pay 0.25% per swap.',
    Revenue: 'No revenue',
    SupplySideRevenue: 'All swap fees distributes to LPs.',
  },
  fetch: getUniV2LogAdapter({ factory: '0x80f112CD8Ac529d6993090A0c9a04E01d495BfBf', fees: 0.0025, userFeesRatio: 1, revenueRatio: 0 }),
  chains: [CHAIN.BSC],
  start: 1648005393,
}

export default adapter;
