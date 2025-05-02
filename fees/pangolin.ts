import { graph } from "@defillama/sdk";
import { CHAIN } from "../helpers/chains";
import { univ2DimensionAdapter2 } from "../helpers/getUniSubgraph";

const adapter = univ2DimensionAdapter2({
  graphUrls: {
    [CHAIN.AVAX]: graph.modifyEndpoint('CPXTDcwh6tVP88QvFWW7pdvZJsCN4hSnfMmYeF1sxCLq')
  },
  totalVolume: {
    factory: "pangolinFactories"
  },
  feesPercent: {
    type: "volume",
    UserFees: 0.3,
    Fees: 0.3,
    SupplySideRevenue: 0.25,
    HoldersRevenue: 0.0425,
    ProtocolRevenue: 0.0075,
    Revenue: 0.05
  }
}, {
  methodology: {
    UserFees: "User pays 0.3% fees on each swap",
    Fees: "A 0.3% of each swap is collected as trading fees",
    SupplySideRevenue: "A 0.25% from each swap is distributed to liquidity providers",
    HoldersRevenue: "A 0.0425% trading fees goes to PNG staking Pool",
    ProtocolRevenue: "A 0.0075% fees goes to Pangolin DAO’s treasury",
    Revenue: "Governance revenue is 0.05% trading fees",
  }
});


export default adapter;
