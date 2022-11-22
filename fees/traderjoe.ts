import { getDexChainBreakdownFees } from "../helpers/getUniSubgraphFees";
import volumeAdapter from "../dexs/traderjoe";
import { Adapter } from "../adapters/types";

const TOTAL_FEES = 0.003;
const PROTOCOL_FEES = 0.0005;

const breakdownAdapter = getDexChainBreakdownFees({
  totalFees: TOTAL_FEES,
  protocolFees: PROTOCOL_FEES,
  volumeAdapter
});

const adapter: Adapter = {
  breakdown: breakdownAdapter
};

export default adapter;
