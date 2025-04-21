// 0.25% swap fee, 0.17% to LP, 0.08% to protocol
// https://docs.dackieswap.xyz/products/product-features/traders/trading-fee

import { getDexChainFees } from "../helpers/getUniSubgraphFees";
import volumeAdapter from "../dexs/dackieswap-v2";
import { Adapter, BaseAdapter } from "../adapters/types";

const TOTAL_FEES = 0.0025;
const LP_FEES = 0.0017;
const PROTOCOL_FEES = 0.0008;

const feeAdapter: BaseAdapter = getDexChainFees({
  totalFees: TOTAL_FEES,
  protocolFees: PROTOCOL_FEES,
  supplySideRevenue: LP_FEES,
  revenue: PROTOCOL_FEES,
  userFees: TOTAL_FEES,
  volumeAdapter
});

const adapter: Adapter = {
  version: 2,
  adapter: feeAdapter
};

export default adapter;
