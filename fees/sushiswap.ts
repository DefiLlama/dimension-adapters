import { getDexChainFees } from "../helpers/getUniSubgraphFees";
import volumeAdapter from "../dexs/sushiswap";
import { Adapter } from "../adapters/types";

const TOTAL_FEES = 0.003;
const PROTOCOL_FEES = 0.0005;

const classic = getDexChainFees({
  totalFees: TOTAL_FEES,
  protocolFees: PROTOCOL_FEES,
  volumeAdapter: {adapter: volumeAdapter.breakdown.classic}
});

const trident = getDexChainFees({
  totalFees: TOTAL_FEES,
  protocolFees: PROTOCOL_FEES,
  volumeAdapter: {adapter: volumeAdapter.breakdown.trident}
});
const adapter: Adapter = {
  breakdown: {
    classic: classic,
    trident: trident
  }
};


export default adapter;
