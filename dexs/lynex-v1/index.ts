import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getChainVolume } from "../../helpers/getUniSubgraphVolume";

const graphqlV3 = getChainVolume({
  graphUrls: {
    [CHAIN.LINEA]: "https://api.studio.thegraph.com/query/59052/lynex-v1/v0.1.0",
  },
  totalVolume: {
    factory: "factories",
    field: "totalVolumeUSD",
  },
  dailyVolume: {
    factory: "dayData",
    field: "dailyVolumeUSD",
    dateField: "date"
  }
});


const adapters: SimpleAdapter = {
  adapter: {
    [CHAIN.LINEA]: {
      fetch: graphqlV3(CHAIN.LINEA),
      start: 1707620640,
    },
  },
  version: 2,
}

export default adapters;
