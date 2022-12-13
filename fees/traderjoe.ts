import { getDexChainFees } from "../helpers/getUniSubgraphFees";
import volumeAdapter from "../dexs/traderjoe";
import { Adapter } from "../adapters/types";


const TOTAL_FEES = 0.003;
const PROTOCOL_FEES = 0.0005;

const adapterV1 = getDexChainFees({
  totalFees: TOTAL_FEES,
  protocolFees: PROTOCOL_FEES,
  volumeAdapter: {adapter: volumeAdapter.breakdown.v1}
});

const adapterV2 = getDexChainFees({
  totalFees: TOTAL_FEES,
  volumeAdapter: {adapter: volumeAdapter.breakdown.v1}
});

const adapter: Adapter = {
  breakdown: {
    v1: adapterV1,
    v2: adapterV2
  }
};


export default adapter;
