import { ChainEndpoints, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import getChainData, { MIN_TIMESTAMP } from "./getChainData";

const endpoints: ChainEndpoints = {
  [CHAIN.POLYGON]: "https://api.thegraph.com/subgraphs/name/iharishkumar/bhavish-prediction-subgraph",
  [CHAIN.ARBITRUM]: "https://api.thegraph.com/subgraphs/name/bhargav55/arbitrum-prediction",
  [CHAIN.POLYGON_ZKEVM]: "https://api.studio.thegraph.com/query/48104/zkevm-polygon/version/latest",
  [CHAIN.MANTLE]: "https://mantle-subgraph.nexter.fi/subgraphs/name/bhavish-finance/bhavish-subgraph",
  [CHAIN.TELOS]: "https://telos-subgraph.nexter.fi/subgraphs/name/bhavish-finance/bhavish-subgraph",
};

const adapter: SimpleAdapter = {
  adapter: Object.keys(endpoints).reduce((acc, chain) => {
    return {
      ...acc,
      [chain]: {
        fetch: async (timestamp: number) => await getChainData(endpoints[chain], timestamp, chain),
        start: MIN_TIMESTAMP
      }
    }
  }, {})
};
export default adapter;