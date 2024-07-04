import { SimpleAdapter } from "../../adapters/types";
import {
  DEFAULT_DAILY_VOLUME_FIELD,
  DEFAULT_TOTAL_VOLUME_FIELD,
  getGraphDimensions,
} from "../../helpers/getUniSubgraph";
import { CHAIN } from "../../helpers/chains";
import { Chain } from "@defillama/sdk/build/general";
import { getEnv } from "../../helpers/env";

const SMARDEX_SUBGRAPH_API_KEY = getEnv('SMARDEX_SUBGRAPH_API_KEY');
const SMARDEX_SUBGRAPH_GATEWAY = "https://subgraph.smardex.io/defillama";

// if (!SMARDEX_SUBGRAPH_API_KEY) {
//   console.error('')
//   // throw new Error("Missing SMARDEX_SUBGRAPH_API_KEY env variable");
// }

const defaultHeaders = {
  "x-api-key": SMARDEX_SUBGRAPH_API_KEY,
};

const graphUrls = {
  [CHAIN.ARBITRUM]: `${SMARDEX_SUBGRAPH_GATEWAY}/arbitrum`,
  [CHAIN.BASE]: `${SMARDEX_SUBGRAPH_GATEWAY}/base`,
  [CHAIN.BSC]: `${SMARDEX_SUBGRAPH_GATEWAY}/bsc`,
  [CHAIN.ETHEREUM]: `${SMARDEX_SUBGRAPH_GATEWAY}/ethereum`,
  [CHAIN.POLYGON]: `${SMARDEX_SUBGRAPH_GATEWAY}/polygon`,
};

type IMap = {
  [s: string | Chain]: any;
}
const graphRequestHeaders:IMap = {
  [CHAIN.ARBITRUM]: defaultHeaders,
  [CHAIN.BASE]: defaultHeaders,
  [CHAIN.BSC]: defaultHeaders,
  [CHAIN.ETHEREUM]: defaultHeaders,
  [CHAIN.POLYGON]: defaultHeaders,
};

const startTimes = {
  [CHAIN.ARBITRUM]: 1689582249,
  [CHAIN.BASE]: 1691491872,
  [CHAIN.BSC]: 1689581494,
  [CHAIN.ETHEREUM]: 1678404995,
  [CHAIN.POLYGON]: 1689582144,
}

/**
 * @note We are using this method that allow us to use http headers
 * The method `getGraphDimensions` try returns daily fees and total fees
 * but we are currently not using them in our subgraphs, so they are undefined
 */
const graphs = getGraphDimensions({
  graphUrls,
  graphRequestHeaders,
  totalVolume: {
    factory: "smardexFactories",
    field: DEFAULT_TOTAL_VOLUME_FIELD,
  },
  dailyVolume: {
    factory: "factoryDayData",
    field: DEFAULT_DAILY_VOLUME_FIELD,
    dateField: "date",
  },
});

const adapter: SimpleAdapter = { adapter: {}, version: 2 }

Object.keys(graphUrls).map((chain: string) => {
  adapter.adapter[chain] = {
    fetch: graphs(chain), 
    start: startTimes[chain]
  }
})

export default adapter;
