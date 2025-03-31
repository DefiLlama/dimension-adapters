// 0.25% LP fee + 0.05% Ronin Treasury fee
// https://docs.roninchain.com/apps/katana/swap-tokens

import { getDexChainFees } from "../helpers/getUniSubgraphFees";
import volumeAdapter from "../dexs/katana";
import { Adapter, BaseAdapter } from "../adapters/types";

const TOTAL_FEES = 0.003;
const LP_FEES = 0.0025;
const PROTOCOL_FEES = 0.0005;

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
