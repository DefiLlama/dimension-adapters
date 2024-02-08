import { CHAIN } from "../helpers/chains";
import { univ2DimensionAdapter } from "../helpers/getUniSubgraph";

const adapters = univ2DimensionAdapter({
  graphUrls: {
    [CHAIN.CRONOS]: "https://graph.cronoslabs.com/subgraphs/name/ferro/swap",
  },
  dailyVolume: {
    factory: "dailyVolume",
    field: "volume",
    dateField: "timestamp"
  },
  totalVolume: {
    factory: "tradeVolumes",
    field: "volume"
  },
  feesPercent: {
    type: "volume",
    Fees: 0.04,
    UserFees: 0.04,
    Revenue: 0.02,
    ProtocolRevenue: 0.004,
    HoldersRevenue: 0.016,
    SupplySideRevenue: 0.02,
  }
}, {
});
adapters.adapter.cronos.start = 1661731973;
export default adapters;
