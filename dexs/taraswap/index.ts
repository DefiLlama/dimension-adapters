import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getGraphDimensions2 } from "../../helpers/getUniSubgraph";

const v3Graphs = getGraphDimensions2({
  graphUrls: {
    [CHAIN.TARA]: "https://indexer.lswap.app/subgraphs/name/taraxa/uniswap-v3"
  },
  totalVolume: {
    factory: "factories",
  },
});

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.TARA]: {
      fetch: v3Graphs,
      start: "2023-11-25",
    },
  },
};

export default adapter;
