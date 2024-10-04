import { graph } from "@defillama/sdk";
import { CHAIN } from "../helpers/chains";
import { univ2DimensionAdapter2 } from "../helpers/getUniSubgraph";

const adapters = univ2DimensionAdapter2({
  graphUrls: {
    [CHAIN.FANTOM]: graph.modifyEndpoint('71os49womDk3DFcNRCAFYzATxxMgWpSMKhRn5ih6aWF1')
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
