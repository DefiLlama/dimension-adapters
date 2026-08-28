import { CHAIN } from "../helpers/chains";
import { fraxlendExport } from "../helpers/fraxlend";

export default {
  ...fraxlendExport({
    protocolRevenueRatioFromRevenue: 1,
    registries: {
      [CHAIN.HYPERLIQUID]: '0xf55AF86c9EC3a7d5fa6367c00a120E6B262f718d',
    }
  }),
  start: '2025-06-22',
};
