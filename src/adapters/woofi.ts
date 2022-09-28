import { getDexChainFees } from "../helpers/getUniSubgraphFees";
import volumeAdapter from "@defillama/adapters/volumes/adapters/woofi";
import { FeeAdapter, BaseAdapter } from "../utils/adapters.type";

const TOTAL_FEES = 0.00025;
const PROTOCOL_FEES = 0.00005;

const feeAdapter: BaseAdapter = getDexChainFees({
  totalFees: TOTAL_FEES,
  protocolFees: PROTOCOL_FEES,
  volumeAdapter
});

const adapter: FeeAdapter = {
  fees: feeAdapter
};

export default adapter;
