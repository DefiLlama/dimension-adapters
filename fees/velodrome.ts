import { Adapter } from "../adapter.type";
import volumeAdapter from "../volumes/velodrome";
import { getDexChainFees } from "../helpers/getUniSubgraphFees";

const TOTAL_FEES = 0.002;
const PROTOCOL_FEES = 0.002;

const feeAdapter = getDexChainFees({
  totalFees: TOTAL_FEES,
  protocolFees: PROTOCOL_FEES,
  volumeAdapter
});

const adapter: Adapter = {
  fees: feeAdapter
};


export default adapter;
