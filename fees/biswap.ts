import { graph } from "@defillama/sdk";
import { CHAIN } from "../helpers/chains";
import { univ2DimensionAdapter2 } from "../helpers/getUniSubgraph";

const adapters = univ2DimensionAdapter2({
  graphUrls: {
    [CHAIN.BSC]: graph.modifyEndpoint('2D9rXpMTvAgofWngsyRE17jKr5ywrU4W3Eaa71579qkd')
  },
  totalVolume: {
    factory: "pancakeFactories"
  },
  feesPercent: {
    type: "volume",
    Fees: 0.2,
    UserFees: 0.2,
    Revenue: 0.05,
    ProtocolRevenue: 0.05,
    HoldersRevenue: 0,
    SupplySideRevenue: 0.15,
  }
}, {
  methodology: {
    Fees: "Fees collected from user trading fees",
    UserFees: "Users pays 0.2% of each swap",
    Revenue: "Revenue is 0.05% of each swap which goes to treasury",
    ProtocolRevenue: "A 0.05% of each swap goes to treasure",
    SupplySideRevenue: "A 0.15% fee of each swap is distributed among LPs",
  }
});


export default adapters;
