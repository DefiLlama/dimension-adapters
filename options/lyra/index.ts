import { Chain } from "@defillama/sdk/build/general";
import { BreakdownAdapter, SimpleAdapter } from "../../adapters/types";
import { getChainVolume } from "./getLyraSubgraphVolume";
import {fetchLyraVolumeData} from './v2'
import { CHAIN } from "../../helpers/chains";

const endpoints: { [chain: string]: string[] } = {
  optimism: [
    "https://subgraph.satsuma-prod.com/sw9vuxiQey3c/lyra/optimism-mainnet-newport/api"
  ],
  arbitrum: ["https://subgraph.satsuma-prod.com/sw9vuxiQey3c/lyra/arbitrum-mainnet/api"],
};

const subgraph = getChainVolume({
  graphUrls: endpoints,
});

const adapter: BreakdownAdapter = {
  breakdown: {

    v1: Object.keys(endpoints).reduce((acc, chain) => {
      return {
        ...acc,
        [chain]: {
          fetch: subgraph(chain as Chain),
          start: async () => 1656154800,
        },
      };
    }, {}),
    v2: {
        [CHAIN.ETHEREUM]: {
          fetch: fetchLyraVolumeData,
          start: async () => 1702630075,
        }
      }

  }
  
};
export default adapter;
