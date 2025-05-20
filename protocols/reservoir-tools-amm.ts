import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getGraphDimensions2 } from "../helpers/getUniSubgraph";



const v2Endpoints: { [s: string]: string } = {
  [CHAIN.INK]: "https://graph-node.reservoir.tools/subgraphs/name/ink/v2-subgraph",
  [CHAIN.ZERO]: "https://graph-node.reservoir.tools/subgraphs/name/zero/v2-subgraph",
  [CHAIN.SHAPE]: "https://graph-node.reservoir.tools/subgraphs/name/shape/v2-subgraph",
  [CHAIN.ABSTRACT]: "https://graph-node.reservoir.tools/subgraphs/name/abstract/v2-subgraph",
}

const v2Graph = getGraphDimensions2({
  graphUrls: v2Endpoints,
  feesPercent: {
    type: "volume",
    UserFees: 0.3,
    ProtocolRevenue: 0,
    SupplySideRevenue: 0.3,
    HoldersRevenue: 0,
    Revenue: 0,
    Fees: 0.3
  }
});


const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.INK]: {
      fetch: (options: FetchOptions) =>  {
        return v2Graph(options.chain)(options)
      },
      start: '2025-01-07',
    },
    [CHAIN.ZERO]: {
      fetch: (options: FetchOptions) =>  {
        return v2Graph(options.chain)(options)
      },
      start: '2025-01-07',
    },
    [CHAIN.SHAPE]: {
      fetch: (options: FetchOptions) =>  {
        return v2Graph(options.chain)(options)
      },
      start: '2025-01-07',
    },
    [CHAIN.ABSTRACT]: {
      fetch: (options: FetchOptions) =>  {
        return v2Graph(options.chain)(options)
      },
      start: '2025-01-07',
    },
  }
}

export default adapter;
