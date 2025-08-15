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
  fetch: getUniV2LogAdapter({ factory: '0xFf9A4E72405Df3ca3D909523229677e6B2b8dC71', userFeesRatio: 1, revenueRatio: 0 }),
  chains: [CHAIN.BSC],
  start: 1652757593,
}

export default adapter;
