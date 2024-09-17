import * as sdk from "@defillama/sdk";
import { CHAIN } from "../helpers/chains";
import { univ2DimensionAdapter } from "../helpers/getUniSubgraph";

const adapters = univ2DimensionAdapter({
  graphUrls: {
    [CHAIN.FANTOM]: sdk.graph.modifyEndpoint('71os49womDk3DFcNRCAFYzATxxMgWpSMKhRn5ih6aWF1')
  },
  dailyVolume: {
    factory: "wigoDayData"
  },
  totalVolume: {
    factory: "wigoswapFactories"
  },
  feesPercent: {
    type: "volume",
    Fees: 0.19,
    UserFees: 0.19,
    Revenue: 0.01,
    ProtocolRevenue: 0,
    HoldersRevenue: 0.01,
    SupplySideRevenue: 0.18,
  }
}, {
});
adapters.adapter.fantom.start = 1642982400;

export default adapters;
