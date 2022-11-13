import { SimpleAdapter } from "../../adapters/types";


const {
  getChainVolume,
} = require("../../helpers/getLyraSubgraphVolume");

const endpoints: { [chain: string]: string } = {
  optimism: "https://subgraph.satsuma-prod.com/lyra/optimism-mainnet/api",
};

const subgraph = getChainVolume({
  graphUrls: endpoints,
});

const adapter: SimpleAdapter = {
  adapter: Object.keys(endpoints).reduce((acc, chain) => {
    return {
      ...acc,
      [chain]: {
        fetch: subgraph(chain),
        start: async () => 1656154800
      }
    }
  }, {})
};
export default adapter;
