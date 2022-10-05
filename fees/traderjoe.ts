import { getDexChainFees } from "../helpers/getUniSubgraphFees";
import volumeAdapter from "../volumes/traderjoe";
import { Adapter, BaseAdapter } from "../adapter.type";

const TOTAL_FEES = 0.003;
const PROTOCOL_FEES = 0.0005;

const feeAdapter: BaseAdapter = getDexChainFees({
  totalFees: TOTAL_FEES,
  protocolFees: PROTOCOL_FEES,
  volumeAdapter
});

const adapter: Adapter = {
    adapter: feeAdapter
};

export default adapter;
