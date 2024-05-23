import { CHAIN } from "../helpers/chains";
import { univ2DimensionAdapter } from "../helpers/getUniSubgraph";

const adapters = univ2DimensionAdapter({
  graphUrls: {
    [CHAIN.POLYGON]: " https://api.thegraph.com/subgraphs/name/1hive/honeyswap-polygon",
    [CHAIN.XDAI]: "https://api.thegraph.com/subgraphs/name/1hive/honeyswap-xdai"
  },
  dailyVolume: {
    factory: "honeyswapDayData"
  },
  totalVolume: {
    factory: "honeyswapFactories"
  },
  feesPercent: {
    type: 'volume',
    Fees: 0.3,
    UserFees: 0.3,
    SupplySideRevenue: 0.25,
    HoldersRevenue: 0,
    ProtocolRevenue: 0.05,
    Revenue: 0.05
  }
}, {
  methodology: {
    UserFees: "A 0.3% fee is charged for token swaps",
    Fees: "Trading fees are 0.3% of each swap",
    SupplySideRevenue: "A 0.25% of each swap is distributed to liquidity providers",
    Revenue: "A 0.05% trading fee goes to treasury",
    HoldersRevenue: "There's no revenue from trading fees for token holders",
    ProtocolRevenue: "A 0.05% goes to the protocol treasury"
  }
});
adapters.adapter.polygon.start = 1622173831;
adapters.adapter.xdai.start = 1599191431;

export default adapters;
