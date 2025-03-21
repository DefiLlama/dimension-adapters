import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { DEFAULT_TOTAL_VOLUME_FIELD, getGraphDimensions2 } from "../helpers/getUniSubgraph";

const v3Endpoints: { [key: string]: string } = {
  [CHAIN.ABSTRACT]: "https://graph-node.internal.reservoir.tools/subgraphs/name/abstract/v3-subgraph",
  [CHAIN.ZERO]: "https://graph-node.internal.reservoir.tools/subgraphs/name/zero/v3-subgraph",
  [CHAIN.SHAPE]: "https://graph-node.internal.reservoir.tools/subgraphs/name/shape/v3-subgraph",
  [CHAIN.REDSTONE]: "https://graph-node.internal.reservoir.tools/subgraphs/name/redstone/v3-subgraph",
}

// https://graph-node.internal.reservoir.tools/subgraphs/name/abstract/v3-subgraph
// https://graph-node.internal.reservoir.tools/subgraphs/name/zero/v3-subgraph
// https://graph-node.internal.reservoir.tools/subgraphs/name/shape/v3-subgraph
// https://graph-node.internal.reservoir.tools/subgraphs/name/redstone/v3-subgraph
// https://graph-node.internal.reservoir.tools/subgraphs/name/ink/v3-subgraph

const v3Graphs = getGraphDimensions2({
  graphUrls: v3Endpoints,
  totalVolume: {
    factory: "factories",
    field: DEFAULT_TOTAL_VOLUME_FIELD,
  },
  feesPercent: {
    type: "fees",
    ProtocolRevenue: 0,
    HoldersRevenue: 0,
    UserFees: 100, // User fees are 100% of collected fees
    SupplySideRevenue: 100, // 100% of fees are going to LPs
    Revenue: 0 // Revenue is 100% of collected fees
  }
});


const adapters: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.ABSTRACT]: {
      fetch: (options: FetchOptions) =>  {
        return v3Graphs(options.chain)(options)
      }
    },
    [CHAIN.ZERO]: {
      fetch: (options: FetchOptions) =>  {
        return v3Graphs(options.chain)(options)
      }
    },
    [CHAIN.SHAPE]: {
      fetch: (options: FetchOptions) =>  {
        return v3Graphs(options.chain)(options)
      }
    },
    [CHAIN.REDSTONE]: {
      fetch: (options: FetchOptions) =>  {
        return v3Graphs(options.chain)(options)
      }
    },
  }
}

export default adapters
