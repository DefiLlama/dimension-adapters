import * as sdk from "@defillama/sdk";
import { CHAIN } from "../helpers/chains";
import { univ2DimensionAdapter2 } from "../helpers/getUniSubgraph";

const adapter = univ2DimensionAdapter2({
  graphUrls: {
    [CHAIN.ARBITRUM]: "https://api.studio.thegraph.com/query/92690/arbitrum-client/version/latest",
    [CHAIN.AVAX]: "https://api.studio.thegraph.com/query/91831/avax-client/version/latest",
    [CHAIN.BSC]: "https://api.studio.thegraph.com/query/92679/bnb-client/version/latest",
    [CHAIN.FANTOM]: "https://api.studio.thegraph.com/query/92675/fantom-client/version/latest",
    [CHAIN.POLYGON]: "https://api.studio.thegraph.com/query/92672/polygon-client/version/latest",
    // [CHAIN.HECO]: "https://api.thegraph.com/subgraphs/name/elkfinance/elkdex-heco"
    [CHAIN.XDAI]: "https://api.studio.thegraph.com/query/92677/gnosis-client/version/latest",
    // [CHAIN.MOONRIVER]: "https://moonriver-graph.elk.finance/subgraphs/name/elkfinance/elkdex-moonriver",
    // [CHAIN.ELASTOS]: "https://elastos-graph.elk.finance/subgraphs/name/elkfinance/elkdex-elastos",
    // [CHAIN.OKEXCHAIN]: "https://okex-graph.elk.finance/subgraphs/name/elkfinance/elkdex-okex",
    // [CHAIN.KCC]: "https://kcc-graph.elk.finance/subgraphs/name/elkfinance/elkdex-kcc",
    [CHAIN.ETHEREUM]: "https://api.studio.thegraph.com/query/92692/ethereum-client/version/latest",
    [CHAIN.OPTIMISM]: "https://api.studio.thegraph.com/query/92688/optimism-client/version/latest",
    // [CHAIN.CRONOS]: "https://cronos-graph.elk.finance/subgraphs/name/elkfinance/elkdex-cronos",
    // [CHAIN.FUSE]: "https://fuse-graph.elk.finance/subgraphs/name/elkfinance/elkdex-fuse",
    // [CHAIN.IOTEX]: "https://iotex-graph.elk.finance/subgraphs/name/elkfinance/elkdex-iotex",
    // [CHAIN.TELOS]: "https://telos-graph2.elk.finance/subgraphs/name/elkfinance/elkdex-telos"
  },
  totalVolume: {
    factory: "elkDayDatas",
    field: "dailyVolumeUSD"
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
