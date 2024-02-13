import { CHAIN } from "../helpers/chains";
import { univ2DimensionAdapter } from "../helpers/getUniSubgraph";

const adapters = univ2DimensionAdapter({
  graphUrls: {
    [CHAIN.CRONOS]: "https://graph.cronoslabs.com/subgraphs/name/vvs/exchange"
  },
  dailyVolume: {
    factory: "vvsDayData"
  },
  totalVolume: {
    factory: "vvsFactories"
  },
  feesPercent: {
    type: "volume",
    Fees: 0.3,
    UserFees: 0.3,
    Revenue: 0.1,
    ProtocolRevenue: 0.02,
    HoldersRevenue: 0.08,
    SupplySideRevenue: 0.2,
  }
}, {
});
adapters.adapter.cronos.start = 1632035122;
export default adapters;
