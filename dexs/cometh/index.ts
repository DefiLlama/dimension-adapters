import { CHAIN } from "../../helpers/chains";
import { SimpleAdapter } from "../../adapters/types";
import { getUniV2LogAdapter } from "../../helpers/uniswap";

const adapter: SimpleAdapter = {
  version: 2,
  methodology: {
    Fees: 'Users pay 0.5% per swap for most of pairs, 0.01% for stable pairs.',
    UserFees: 'Users pay 0.5% per swap for most of pairs, 0.01% for stable pairs.',
    Revenue: 'No revenue.',
    SupplySideRevenue: 'Swap fees distributed to LPs.',
  },
  fetch: getUniV2LogAdapter({ factory: '0x800b052609c355cA8103E06F022aA30647eAd60a', fees: 0.005, userFeesRatio: 1, revenueRatio: 0 }),
  chains: [CHAIN.POLYGON],
  start: 1622518288,
}

export default adapter;
