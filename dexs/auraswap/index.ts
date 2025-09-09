import { CHAIN } from "../../helpers/chains";
import { SimpleAdapter } from "../../adapters/types";
import { getUniV2LogAdapter } from "../../helpers/uniswap";

const adapter: SimpleAdapter = {
  version: 2,
  methodology: {
    Fees: 'Users pay 03% per swap.',
    UserFees: 'Users pay 03% per swap.',
    SupplySideRevenue: 'Swap fees distributed to LPs.',
  },
  fetch: getUniV2LogAdapter({ factory: '0x015DE3ec460869eb5ceAe4224Dc7112ac0a39303', userFeesRatio: 1, revenueRatio: 0 }),
  chains: [CHAIN.POLYGON],
}

export default adapter;