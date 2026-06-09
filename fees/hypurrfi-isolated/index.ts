import { CHAIN } from "../../helpers/chains";
import { fraxlendExport } from "../../helpers/fraxlend";

export default {
  ...fraxlendExport({
    protocolRevenueRatioFromRevenue: 1,
    registries: {
      [CHAIN.HYPERLIQUID]: '0x5aB54F5Ca61ab60E81079c95280AF1Ee864EA3e7',
    }
  }),
  start: '2025-04-08',
};
