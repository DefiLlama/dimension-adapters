import { ChainEndpoints, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import getChainData, { MIN_TIMESTAMP } from "./getChainData";

const endpoints: ChainEndpoints = {
  [CHAIN.OPTIMISM]: "https://api.thegraph.com/subgraphs/name/thales-markets/thales-markets",
  [CHAIN.POLYGON]: "https://api.thegraph.com/subgraphs/name/thales-markets/thales-polygon",
  [CHAIN.ARBITRUM]: "https://api.thegraph.com/subgraphs/name/thales-markets/thales-arbitrum",
  [CHAIN.BSC]: "https://api.thegraph.com/subgraphs/name/thales-markets/thales-bsc",
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
