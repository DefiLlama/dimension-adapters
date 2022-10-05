import { Adapter } from "../dexVolume.type";
import { getDexChainFees } from "../helpers/getUniSubgraphFees";
import volumeAdapter from "../volumes/mooniswap";

const TOTAL_FEES = 0.003;

const baseAdapter = getDexChainFees({
  totalFees: TOTAL_FEES,
  volumeAdapter
});

const adapter: Adapter = {
  fees: baseAdapter
};

export default adapter;
