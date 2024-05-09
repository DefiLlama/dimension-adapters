import { Chain } from "@defillama/sdk/build/general";
import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const {
  getChainVolume,
} = require("../../helpers/getUniSubgraphVolume");
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
  version: 2,
  adapter: Object.keys(endpoints).reduce((acc, chain: any) => {
    return {
      ...acc,
      [chain]: {
        fetch: graphs(chain as Chain),
        start: 1657443314
      }
    }
  }, {})
};

export default adapter;
