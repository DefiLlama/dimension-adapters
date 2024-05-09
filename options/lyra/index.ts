import { Chain } from "@defillama/sdk/build/general";
import { SimpleAdapter } from "../../adapters/types";
import { getChainVolume } from "./getLyraSubgraphVolume";

const endpoints: { [chain: string]: string[] } = {
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
        start: 1656154800,
      },
    };
  }, {}),
}

export default adapters;
