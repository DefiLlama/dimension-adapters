import { CHAIN } from "../../helpers/chains";
import { SimpleAdapter } from "../../adapters/types";
import { getUniV2LogAdapter } from "../../helpers/uniswap";

const adapter: SimpleAdapter = {
  version: 2,
  methodology: {
    Fees: 'Users pay 0.2% per swap.',
    UserFees: 'Users pay 0.2% per swap.',
    SupplySideRevenue: 'Swap fees distributed to LPs.',
  },
  fetch: getUniV2LogAdapter({ factory: '0x1d21Db6cde1b18c7E47B0F7F42f4b3F68b9beeC9', fees: 0.002, userFeesRatio: 1, revenueRatio: 0 }),
  chains: [CHAIN.POLYGON],
  start: 1652932015,
}

export default adapter;
