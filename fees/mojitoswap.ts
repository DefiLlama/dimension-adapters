import { BaseAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { univ2DimensionAdapter2 } from "../helpers/getUniSubgraph";

const graphUrls = {
  [CHAIN.KCC]: "https://thegraph.kcc.network/subgraphs/name/mojito/swap",
};

const adapter = univ2DimensionAdapter2({
  graphUrls,
  feesPercent: {
    type: "volume",
    UserFees: 0.3,
    Fees: 0.3,
    SupplySideRevenue: 0.18,
    HoldersRevenue: 0.08,
    ProtocolRevenue: 0.04,
    Revenue: 0.12,
  }
}, {
  methodology: {
    UserFees: "Trading fees are 0.3% of each swap",
    Fees: "The transaction fee on MojitoSwap is 0.3%",
    SupplySideRevenue: "Liquidity providers earn a 0.18% of each swap",
    HoldersRevenue: "A 0.08% fee of each swap is used to buyback and burn",
    ProtocolRevenue: "A 0.04% of swap fees goes to MJT treasury",
    Revenue: "Revenue is 0.12% of each swap",
  }
});

(adapter.adapter as BaseAdapter).kcc.start = 1634200191;


export default adapter
