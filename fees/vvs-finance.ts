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
    Fees: 0.2,
    UserFees: 0.2,
    Revenue: 0,
    ProtocolRevenue: 0,
    HoldersRevenue: 0,
    SupplySideRevenue: 0,
  }
}, {
});
adapters.adapter.cronos.start = async () => 1632035122;
export default adapters;
