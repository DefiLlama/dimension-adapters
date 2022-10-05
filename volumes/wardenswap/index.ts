import { Chain } from "@defillama/sdk/build/general";
import { SimpleAdapter } from "../../dexVolume.type";
import { CHAIN } from "../../helper/chains";

const {
  getChainVolume,
} = require("../../helper/getUniSubgraphVolume");
const endpoints = {
  [CHAIN.BSC]: "https://api.thegraph.com/subgraphs/name/wardenluna/wardenswap",
  [CHAIN.OPTIMISM]: "https://api.thegraph.com/subgraphs/name/wardenluna/wardenswap-optimism",
  [CHAIN.ARBITRUM]: "https://api.thegraph.com/subgraphs/name/wardenluna/wardenswap-arbitrum",
  [CHAIN.ETHEREUM]: "https://api.thegraph.com/subgraphs/name/wardenluna/wardenswap-ethereum",
  [CHAIN.POLYGON]: "https://api.thegraph.com/subgraphs/name/wardenluna/wardenswap-polygon",
};


const VOLUME_FIELD = "volumeUSD";
const graphs = getChainVolume({
  graphUrls: endpoints,
  totalVolume: {
    factory: "wardenSwaps",
    field: VOLUME_FIELD,
  },
  dailyVolume: {
    factory: "dayData",
    field: "volumeUSD",
    dateField: "date"
  }
});


const adapter: SimpleAdapter = {
  volume: Object.keys(endpoints).reduce((acc, chain: any) => {
    return {
      ...acc,
      [chain]: {
        fetch: graphs(chain as Chain),
        start: async () => 1657443314
      }
    }
  }, {})
};

export default adapter;
