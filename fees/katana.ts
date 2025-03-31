import { getDexChainFees } from "../helpers/getUniSubgraphFees";
import volumeAdapter from "../dexs/katana";
import { Adapter, BaseAdapter } from "../adapters/types";

const TOTAL_FEES = 0.003;

const feeAdapter: BaseAdapter = getDexChainFees({
  totalFees: TOTAL_FEES,
  protocolFees: 0,
  supplySideRevenue: TOTAL_FEES,
  holdersRevenue: 0,
  revenue: 0,
  userFees: TOTAL_FEES,
  volumeAdapter
});

const adapter: Adapter = {
    version: 2,
    adapter: feeAdapter
};

export default adapter;
