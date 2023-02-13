import { Chain } from "@defillama/sdk/build/general";
import { SimpleAdapter } from "../../adapters/types";
import { getChainVolume } from "./getLyraSubgraphVolume";

const endpoints: { [chain: string]: string } = {
  optimism: "https://api.lyra.finance/subgraph/optimism/v1/api",
  arbitrum: "https://api.lyra.finance/subgraph/arbitrum/v2/api",
};

const subgraph = getChainVolume({
  graphUrls: endpoints,
});

const adapter: SimpleAdapter = {
  adapter: Object.keys(endpoints).reduce((acc, chain) => {
    return {
      ...acc,
      [chain]: {
        fetch: subgraph(chain as Chain),
        start: async () => 1656154800
      }
    }
  }, {})
};
export default adapter;
