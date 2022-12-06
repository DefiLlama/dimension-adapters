import { getDexChainFees } from "../helpers/getUniSubgraphFees";
import volumeAdapter from "../dexs/elk";
import { Adapter, BaseAdapter } from "../adapters/types";

const TOTAL_FEES = 0.003;

const feeAdapter: BaseAdapter = getDexChainFees({
  totalFees: TOTAL_FEES,
  volumeAdapter
});

const adapter: Adapter = {
    adapter: feeAdapter
};

export default adapter;
