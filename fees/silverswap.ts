import { Adapter, } from "../adapters/types"
import { CHAIN } from "../helpers/chains"
import { fetchFee } from '../dexs/silverswap';

const adapter: Adapter = {
  adapter: {
    [CHAIN.SONIC]: {
      fetch: fetchFee(CHAIN.SONIC),
      start: '2024-12-07'
    }
  },
  version: 2,
}
export default adapter;
