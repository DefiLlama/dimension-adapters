import { getDexChainFees } from "../helpers/getUniSubgraphFees";
import volumeAdapter from "../dexs/vvs-finance";
import { Adapter, BaseAdapter } from "../adapters/types";

const TOTAL_FEES = 0.003;
const PROTOCOL_FEES = 0.001;

const feeAdapter: BaseAdapter = getDexChainFees({
  totalFees: TOTAL_FEES,
  protocolFees: PROTOCOL_FEES,
  volumeAdapter
});

const adapter: Adapter = {
  adapter: feeAdapter
};

export default adapter;
