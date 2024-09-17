import { graph } from "@defillama/sdk";
import { CHAIN } from "../../helpers/chains";
import { univ2DimensionAdapter2 } from "../../helpers/getUniSubgraph";

const adapter = univ2DimensionAdapter2({
  graphUrls: {
    [CHAIN.BSC]: graph.modifyEndpoint('FBPHPJNE1jX18Lz8rgscvsigfxAUXakUC8w9KMid4dDz')
  },
  feesPercent: {
    type: "volume",
    UserFees: 0.2, // https://docs.alita.finance/our-products/exchange/swap-fee
    SupplySideRevenue: 0.2, // 0.2% of fees are going to LPs
    Fees: 0.2,
    ProtocolRevenue: 0,
    Revenue: 0// 0.2
  }
}, {
  methodology: {
    UserFees: "User pays 0.2% fees on each transaction",
    SupplySideRevenue: "0.2% of each transaction goes to LPs",
    Fees: "User pays 0.2% fees on each transaction",
    ProtocolRevenue: "Protocol takes no revenue",
    Revenue: "Revenue generated is 0.2% of total volume"
  }
});


adapter.adapter.bsc.start = 1629947542;
export default adapter;
