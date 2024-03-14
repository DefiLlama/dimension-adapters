import { Chain } from "@defillama/sdk/build/general";
import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const {
  getChainVolume,
} = require("../../helpers/getUniSubgraphVolume");
const endpoints = {
  [CHAIN.IOTEX]: "https://graph.mimo.exchange/subgraphs/name/mimo/mainnet"
};

const graphs = getChainVolume({
  graphUrls: endpoints,
  totalVolume: {
    factory: "uniswapFactories",
    field: "totalVolumeUSD",
  },
  dailyVolume: {
    factory: "uniswapDayData",
    field: "dailyVolumeUSD",
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
        start: 1624332218
      }
    }
  }, {})
};

export default adapter;
