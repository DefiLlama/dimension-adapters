import * as sdk from "@defillama/sdk";
import { Chain } from "@defillama/sdk/build/general";
import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import customBackfill from "../../helpers/customBackfill";

const {
  getChainVolume,
} = require("../../helpers/getUniSubgraphVolume");
const endpoints = {
  [CHAIN.ETHEREUM]: sdk.graph.modifyEndpoint('6No9vpT4V56r2c4y4TxHsKs7hEbAWu66u19wNGAX8nxL')
};

const VOLUME_FIELD = "volumeUSD";
const graphs = getChainVolume({
  graphUrls: endpoints,
  totalVolume: {
    factory: "metrics",
    field: VOLUME_FIELD,
  },
  hasDailyVolume: false,
});


const adapter: SimpleAdapter = {
  version: 2,
  adapter: Object.keys(endpoints).reduce((acc, chain: any) => {
    return {
      ...acc,
      [chain]: {
        fetch: graphs(chain as Chain),
        start: 1655003840,
        customBackfill: customBackfill(chain as Chain, graphs)
      }
    }
  }, {})
};

export default adapter;
