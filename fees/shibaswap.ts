import { Adapter } from "../adapters/types";
import volumeAdapter from "../dexs/shibaswap";
import { getDexChainFees } from "../helpers/getUniSubgraphFees";

const TOTAL_FEES = 0.003;

const feeAdapter = getDexChainFees({
  totalFees: TOTAL_FEES,
  volumeAdapter
});

const adapter: Adapter = {
  version: 2,
  adapter: feeAdapter
};


export default adapter;
