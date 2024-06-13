import * as sdk from "@defillama/sdk";
import { ChainEndpoints, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import getChainData, { MIN_TIMESTAMP } from "./getChainData";

const endpoints: ChainEndpoints = {
  [CHAIN.OPTIMISM]: sdk.graph.modifyEndpoint('GADfDRePpbqyjK2Y3JkQTBPBVQj98imhgKo7oRWW7RqQ'),
  [CHAIN.POLYGON]: sdk.graph.modifyEndpoint('G7wi71W3PdtYYidKy5pEmJvJ1Xpop25ogynstRjPdyPG'),
  [CHAIN.ARBITRUM]: sdk.graph.modifyEndpoint('FZH9ySiLCdqKrwefaospe6seSqV1ZoW4FvPQUGP7MFob'),
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
