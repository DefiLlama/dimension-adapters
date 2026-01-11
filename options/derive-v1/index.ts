import { Chain } from "../../adapters/types";
import { SimpleAdapter } from "../../adapters/types";
import { getChainVolume } from "./getDeriveSubgraphVolume";

const endpoints: { [chain: string]: string[] } = {
  // Using subgraph endpoints - these may need to be verified for derive v1
  optimism: [
    "https://subgraph.satsuma-prod.com/sw9vuxiQey3c/lyra/optimism-mainnet-newport/api"
  ],
  arbitrum: ["https://subgraph.satsuma-prod.com/sw9vuxiQey3c/lyra/arbitrum-mainnet/api"],
};

const subgraph = getChainVolume({
  graphUrls: endpoints,
});

const adapters: SimpleAdapter = {
  version: 2,
  adapter: Object.keys(endpoints).reduce((acc, chain) => {
    return {
      ...acc,
      [chain]: {
        fetch: subgraph(chain as Chain),
        start: '2022-06-25',
      },
    };
  }, {}),
}

export default adapters;
