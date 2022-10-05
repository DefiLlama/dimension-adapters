import { Adapter } from "../adapters/types";
import volumeAdapter from "../volumes/wombat-exchange";
import { getDexChainFees } from "../helpers/getUniSubgraphFees";

const TOTAL_FEES = 0.0001;

const feeAdapter = getDexChainFees({
  totalFees: TOTAL_FEES,
  volumeAdapter
});

const adapter: Adapter = {
  adapter: feeAdapter
};


export default adapter;
