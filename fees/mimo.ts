import { CHAIN } from "../helpers/chains";
import { univ2DimensionAdapter } from "../helpers/getUniSubgraph";

const adapter = univ2DimensionAdapter({
  graphUrls: {
    [CHAIN.IOTEX]: "https://graph.mimo.exchange/subgraphs/name/mimo/mainnet"
  },
  totalVolume: {
    factory: "uniswapFactories",
    field: "totalVolumeUSD",
  },
  dailyVolume: {
    factory: "uniswapDayData",
    field: "dailyVolumeUSD",
    dateField: "date"
  },
  feesPercent: {
    type: "volume",
    UserFees: 0.3,
    Fees: 0.3,
    ProtocolRevenue: 0,
    Revenue: 0,
    SupplySideRevenue: 0.3,
    HoldersRevenue: 0,
  }
}, {
  methodology: {
    UserFees: "User pays 0.3% fees on each swap",
    Fees: "All fees are collected from trading fees",
    ProtocolRevenue: "Protocol have no revenue.",
    Revenue: "Protocol have no revenue.",
    SupplySideRevenue: "All user fees are distributed among LPs.",
    HoldersRevenue: "Holders have no revenue."
  }
});




export default adapter;
