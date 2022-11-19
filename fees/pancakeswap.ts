import { getDexChainBreakdownFees } from "../helpers/getUniSubgraphFees";
import volumeAdapter from "../protocols/pancakeswap";
import { Adapter } from "../adapters/types";

const TOTAL_FEES = 0.0025;
const PROTOCOL_FEES = 0.0003;

const breakdownAdapter = getDexChainBreakdownFees({
  totalFees: TOTAL_FEES,
  protocolFees: PROTOCOL_FEES,
  volumeAdapter
});

const adapter: Adapter = {
  breakdown: breakdownAdapter
};

export default adapter;
