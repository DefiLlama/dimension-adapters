import { BaseAdapter, Adapter } from "../adapter.type";
import volumeAdapter from "../volumes/raydium";
import { getDexChainFees } from "../helpers/getUniSubgraphFees";

const TOTAL_FEES = 0.0025;
const PROTOCOL_FEES = 0.0003;

const feeAdapter: BaseAdapter = getDexChainFees({
  totalFees: TOTAL_FEES,
  protocolFees: PROTOCOL_FEES,
  volumeAdapter
});

const adapter: Adapter = {
    fees: feeAdapter
};

export default adapter;
