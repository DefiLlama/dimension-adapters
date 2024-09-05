import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { DEFAULT_TOTAL_VOLUME_FIELD, getGraphDimensions2 } from "../../helpers/getUniSubgraph";

const endpointV3 = {
  [CHAIN.ARBITRUM]: 'https://subgraph-prod.goerli.horiza.io/subgraphs/name/retro-arbitrum-one-uniswap-v3'
}

const v3Graphs = getGraphDimensions2({
  graphUrls: endpointV3,
  totalVolume: {
    factory: "factories",
    field: DEFAULT_TOTAL_VOLUME_FIELD,
  },
  feesPercent: {
    type: "fees",
    ProtocolRevenue: 10,
    HoldersRevenue: 0,
    UserFees: 100,
    SupplySideRevenue: 90,
    Revenue: 10,
  }
});

const adapters: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch: v3Graphs(CHAIN.ARBITRUM),
      start: 1704585600,
    }
  }
}
export default adapters;
