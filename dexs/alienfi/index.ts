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
  fetch: getUniV2LogAdapter({ factory: '0xac9d019B7c8B7a4bbAC64b2Dbf6791ED672ba98B', fees: 0.0025, userFeesRatio: 1, revenueRatio: 0 }),
  chains: [CHAIN.ARBITRUM],
  start: 1676505600,
}

export default adapter;


