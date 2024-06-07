import { getDexChainFees } from "../helpers/getUniSubgraphFees";
import volumeAdapter from "../dexs/spookyswap";
import { Adapter, BaseAdapter } from "../adapters/types";

const TOTAL_FEES = 0.002;
const PROTOCOL_FEES = 0.0003;

const feeAdapter: BaseAdapter = getDexChainFees({
  totalFees: TOTAL_FEES,
  protocolFees: PROTOCOL_FEES,
  supplySideRevenue: 0.002,
  holdersRevenue: 0.0003,
  revenue: 0.0003,
  userFees: TOTAL_FEES,
  volumeAdapter
});

const adapter: Adapter = {
    version: 2,
    adapter: feeAdapter
};

export default adapter;
