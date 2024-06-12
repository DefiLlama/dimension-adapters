import { CHAIN } from "../helpers/chains";
import { univ2DimensionAdapter } from "../helpers/getUniSubgraph";

const adapter = univ2DimensionAdapter({
  graphUrls: {
    [CHAIN.ARBITRUM]: `https://gateway-arbitrum.network.thegraph.com/api/${process.env.GRAPH_PROTOCOL}/subgraphs/id/B8TGNwQ8xMoeFCdsv9dPkciRBpEYAy1UxmXDr7nc9fpE`,
    [CHAIN.AVAX]: `https://gateway-arbitrum.network.thegraph.com/api/${process.env.GRAPH_PROTOCOL}/subgraphs/id/2dyce92CewvhV17C8BMFoMCgaXdPTtwBzaz8AReQR3YV`,
    [CHAIN.BSC]: `https://gateway-arbitrum.network.thegraph.com/api/${process.env.GRAPH_PROTOCOL}/subgraphs/id/5tRz9anigEVND48Gx1mUpNNM4YSm3NpzG9XRB8dYAMhb`,
    [CHAIN.FANTOM]: `https://gateway-arbitrum.network.thegraph.com/api/${process.env.GRAPH_PROTOCOL}/subgraphs/id/pmqe2dQvH4PK7aaFh4GXrr49wpKRr3GjPCnNEgEb6U2`,
    [CHAIN.POLYGON]: `https://gateway-arbitrum.network.thegraph.com/api/${process.env.GRAPH_PROTOCOL}/subgraphs/id/8jzpT6nnKgmqcdGocys97YWkuqwDbHBxpozsKcxH1KUP`,
    // [CHAIN.HECO]: "https://api.thegraph.com/subgraphs/name/elkfinance/elkdex-heco"
    [CHAIN.XDAI]: `https://gateway-arbitrum.network.thegraph.com/api/${process.env.GRAPH_PROTOCOL}/subgraphs/id/kD9njskfB9xv7gDnsU2sz4X4sXfEimBv8xMJ6votFND`,
    // [CHAIN.MOONRIVER]: "https://moonriver-graph.elk.finance/subgraphs/name/elkfinance/elkdex-moonriver",
    // [CHAIN.ELASTOS]: "https://elastos-graph.elk.finance/subgraphs/name/elkfinance/elkdex-elastos",
    // [CHAIN.OKEXCHAIN]: "https://okex-graph.elk.finance/subgraphs/name/elkfinance/elkdex-okex",
    // [CHAIN.KCC]: "https://kcc-graph.elk.finance/subgraphs/name/elkfinance/elkdex-kcc",
    [CHAIN.ETHEREUM]: `https://gateway-arbitrum.network.thegraph.com/api/${process.env.GRAPH_PROTOCOL}/subgraphs/id/59tcH5BPyXj41XZgn1ZYy4pE8iDdzaZpR9MRhmuPW4Lr`,
    [CHAIN.OPTIMISM]: `https://gateway-arbitrum.network.thegraph.com/api/${process.env.GRAPH_PROTOCOL}/subgraphs/id/H7UcKWuAqQPqWKcnNLn2Jamy9zE7wVgsLSRQpPwXo2Ag`,
    // [CHAIN.CRONOS]: "https://cronos-graph.elk.finance/subgraphs/name/elkfinance/elkdex-cronos",
    // [CHAIN.FUSE]: "https://fuse-graph.elk.finance/subgraphs/name/elkfinance/elkdex-fuse",
    // [CHAIN.IOTEX]: "https://iotex-graph.elk.finance/subgraphs/name/elkfinance/elkdex-iotex",
    // [CHAIN.TELOS]: "https://telos-graph2.elk.finance/subgraphs/name/elkfinance/elkdex-telos"
  },
  dailyVolume: {
    factory: "elkDayData"
  },
  totalVolume: {
    factory: "elkFactories"
  },
  feesPercent: {
    type: "volume",
    UserFees: 0.3,
    Fees: 0.3,
    HoldersRevenue: 0,
    Revenue: 0,
    SupplySideRevenue: 0.3,
    ProtocolRevenue: 0
  }
}, {
  methodology: {
    UserFees: "Users pay a trading fee of 0.3%",
    Fees: "Is collected 0.3% of each swap",
    HoldersRevenue: "Holders have no revenue from swap fees",
    Revenue: "Treasury have no revenue",
    SupplySideRevenue: "LP earn a 0.3% of each swap",
    ProtocolRevenue: "Treasury have no revenue"
  }
});

adapter.adapter.arbitrum.start = 1648950817;
adapter.adapter.avax.start = 1616118817;
adapter.adapter.bsc.start = 1629251617;
adapter.adapter.fantom.start = 1621562017;
adapter.adapter.polygon.start = 1618019617;
adapter.adapter.xdai.start = 1629251617;
// adapter.adapter.elastos.start = 1634954017;
// adapter.adapter.okexchain.start = 1649555617;
// adapter.adapter.kcc.start = 1634954017;
adapter.adapter.ethereum.start = 1619747617;
adapter.adapter.optimism.start = 1651542817;
// adapter.adapter.fuse.start = 1639187617;
// adapter.adapter.iotex.start = 1639792417;
// adapter.adapter.telos.start = 1648684800;

export default adapter;
