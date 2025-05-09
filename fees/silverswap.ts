import { Adapter, } from "../adapters/types"
import { CHAIN } from "../helpers/chains"
import { fetchFee } from '../dexs/silverswap/getAlgebraData';

const methodology = {
	UserFees: "LPs collect 90% of the fee generated in a pool",
	Fees: "Fees generated on each swap at a rate set by the pool.",
	TotalUserFees: "Cumulative all-time Fees",
	TotalFees: "Cumulative all-time Fees",
};
  
const adapter: Adapter = {
  adapter: {
    [CHAIN.SONIC]: {
      fetch: fetchFee(CHAIN.SONIC),
      start: '2024-12-07',
      meta: {
        methodology,
      },
    }
  },
}
export default adapter;
