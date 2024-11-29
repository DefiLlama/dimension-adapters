import { Adapter } from "../adapters/types";
import { getDexChainFees } from "../helpers/getUniSubgraphFees";
import volumeAdapter from "../dexs/mooniswap";

const TOTAL_FEES = 0.003;

const baseAdapter = getDexChainFees({
  totalFees: TOTAL_FEES,
  volumeAdapter
});

const adapter: Adapter = {
  version: 2,
  adapter: baseAdapter
};

export default adapter;
