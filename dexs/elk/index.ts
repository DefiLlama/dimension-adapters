import * as sdk from "@defillama/sdk";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";
import { CHAIN } from "../../helpers/chains";
import { SimpleAdapter } from "../../adapters/types";
// import { getUniV2LogAdapter } from "../../helpers/uniswap";

const fetch = univ2Adapter({
  endpoints: {
    [CHAIN.ARBITRUM]: sdk.graph.modifyEndpoint('B8TGNwQ8xMoeFCdsv9dPkciRBpEYAy1UxmXDr7nc9fpE'),
    [CHAIN.AVAX]: sdk.graph.modifyEndpoint('2dyce92CewvhV17C8BMFoMCgaXdPTtwBzaz8AReQR3YV'),
    [CHAIN.BSC]: sdk.graph.modifyEndpoint('5tRz9anigEVND48Gx1mUpNNM4YSm3NpzG9XRB8dYAMhb'),
    [CHAIN.FANTOM]: sdk.graph.modifyEndpoint('pmqe2dQvH4PK7aaFh4GXrr49wpKRr3GjPCnNEgEb6U2'),
    [CHAIN.POLYGON]: sdk.graph.modifyEndpoint('8jzpT6nnKgmqcdGocys97YWkuqwDbHBxpozsKcxH1KUP'),
    // [CHAIN.HECO]: "https://api.thegraph.com/subgraphs/name/elkfinance/elkdex-heco"
    [CHAIN.XDAI]: sdk.graph.modifyEndpoint('kD9njskfB9xv7gDnsU2sz4X4sXfEimBv8xMJ6votFND'),
    // [CHAIN.MOONRIVER]: "https://moonriver-graph.elk.finance/subgraphs/name/elkfinance/elkdex-moonriver",
    // [CHAIN.ELASTOS]: "https://elastos-graph.elk.finance/subgraphs/name/elkfinance/elkdex-elastos",
    // [CHAIN.OKEXCHAIN]: "https://okex-graph.elk.finance/subgraphs/name/elkfinance/elkdex-okex",
    // [CHAIN.KCC]: "https://kcc-graph.elk.finance/subgraphs/name/elkfinance/elkdex-kcc",
    [CHAIN.ETHEREUM]: sdk.graph.modifyEndpoint('59tcH5BPyXj41XZgn1ZYy4pE8iDdzaZpR9MRhmuPW4Lr'),
    [CHAIN.OPTIMISM]: sdk.graph.modifyEndpoint('H7UcKWuAqQPqWKcnNLn2Jamy9zE7wVgsLSRQpPwXo2Ag'),
    // [CHAIN.CRONOS]: "https://cronos-graph.elk.finance/subgraphs/name/elkfinance/elkdex-cronos",
    // [CHAIN.FUSE]: "https://fuse-graph.elk.finance/subgraphs/name/elkfinance/elkdex-fuse",
    // [CHAIN.IOTEX]: "https://iotex-graph.elk.finance/subgraphs/name/elkfinance/elkdex-iotex",
    // [CHAIN.TELOS]: "https://telos-graph2.elk.finance/subgraphs/name/elkfinance/elkdex-telos"
    },
  factoriesName: "elkFactories",
  dayData: "elkDayData",
});

const adapter: SimpleAdapter = {
  version: 1,
  adapter: {
    [CHAIN.ARBITRUM]: { fetch, start: 1648950817 },
    [CHAIN.AVAX]: { fetch, start: 1616118817 },
    [CHAIN.BSC]: { fetch, start: 1629251617 },
    [CHAIN.FANTOM]: { fetch, start: 1621562017 },
    [CHAIN.POLYGON]: { fetch, start: 1618019617 },
    [CHAIN.XDAI]: { fetch, start: 1629251617 },
    [CHAIN.ETHEREUM]: { fetch, start: 1619747617 },
    [CHAIN.OPTIMISM]: { fetch, start: 1651542817 },
    // [CHAIN.ELASTOS]: { fetch, start: 1634954017 },
    // [CHAIN.OKEXCHAIN]: { fetch, start: 1649555617 },
    // [CHAIN.KCC]: { fetch, start: 1634954017 },
    // [CHAIN.CRONOS]: { fetch, start: 1648684800 },
    // [CHAIN.FUSE]: { fetch, start: 1639187617 },
    // [CHAIN.IOTEX]: { fetch, start: 1639792417 },
    // [CHAIN.TELOS]: { fetch, start: 1648684800 },
  },
}

export default adapter;
