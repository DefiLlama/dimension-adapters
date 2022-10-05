import { SimpleVolumeAdapter } from "../../dexVolume.type";


const {
  getChainVolume,
} = require("../../helpers/getLyraSubgraphVolume");

const endpoints: { [chain: string]: string } = {
  optimism: "https://api.thegraph.com/subgraphs/name/lyra-finance/mainnet",
};

const subgraph = getChainVolume({
  graphUrls: endpoints,
});

const adapter: SimpleVolumeAdapter = {
  adapter: Object.keys(endpoints).reduce((acc, chain) => {
    return {
      ...acc,
      [chain]: {
        fetch: subgraph(chain),
        start: async () => 1656154800,
        runAtCurrTime: true
      }
    }
  }, {}) as SimpleVolumeAdapter['volume']
};
export default adapter;
