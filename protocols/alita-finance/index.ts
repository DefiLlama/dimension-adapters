import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";
import { CHAIN } from "../../helpers/chains";
import { univ2DimensionAdapter } from "../../helpers/getUniSubgraph";

const adapter = univ2DimensionAdapter({
  graphUrls: {
    [CHAIN.BSC]: "https://api.thegraph.com/subgraphs/name/alita-finance/exchangev2"
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
