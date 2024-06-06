import { getDexChainFees } from "../helpers/getUniSubgraphFees";
import volumeAdapter from "../dexs/radioshack";
import { Adapter, BaseAdapter } from "../adapters/types";

const TOTAL_FEES = 0.001;
const PROTOCOL_FEES = 0.00016666667;

const feeAdapter: BaseAdapter = getDexChainFees({
  totalFees: TOTAL_FEES,
  protocolFees: PROTOCOL_FEES,
  volumeAdapter
});

const adapter: Adapter = {
  version: 2,
  adapter: feeAdapter
};

export default adapter;
