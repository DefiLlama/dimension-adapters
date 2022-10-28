import { getDexChainFees } from "../helpers/getUniSubgraphFees";
import volumeAdapter from "../dexs/woofi";
import { Adapter, BaseAdapter } from "../adapters/types";

const TOTAL_FEES = 0.00025;
const PROTOCOL_FEES = 0.00005;

const feeAdapter: BaseAdapter = getDexChainFees({
  totalFees: TOTAL_FEES,
  protocolFees: PROTOCOL_FEES,
  volumeAdapter
});

const adapter: Adapter = {
  adapter: feeAdapter
};

export default adapter;
