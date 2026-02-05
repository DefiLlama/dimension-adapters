import { CHAIN } from "../../helpers/chains";
import { SimpleAdapter } from "../../adapters/types";
import { getUniV2LogAdapter } from "../../helpers/uniswap";

const adapter: SimpleAdapter = {
  version: 2,
  methodology: {
    Fees: 'Users pay fees per swap.',
    UserFees: 'Users pay fees per swap.',
    Revenue: 'No revenue.',
    SupplySideRevenue: 'Swap fees distributed to LPs.',
  },
  fetch: getUniV2LogAdapter({ factory: '0x8D4f9b98FC21787382647BFCfC9ce75C08B50481', userFeesRatio: 1, revenueRatio: 0 }),
  chains: [CHAIN.ASTAR],
}

export default adapter;