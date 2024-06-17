import { getDexChainFees } from "../helpers/getUniSubgraphFees";
import volumeAdapter from "../dexs/mm-stableswap-polygon";
import { Adapter, BaseAdapter } from "../adapters/types";

const TOTAL_FEES = 0.0017;
const PROTOCOL_FEES = 0.0002;

const feeAdapter: BaseAdapter = getDexChainFees({
  totalFees: TOTAL_FEES,
  protocolFees: PROTOCOL_FEES,
  volumeAdapter
});

const adapter: Adapter = {
  version: 2,
  adapter: feeAdapter
};

export default adapter;
