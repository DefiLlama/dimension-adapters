import { SimpleAdapter } from "../adapters/types";
const {
  getChainVolume2,
  DEFAULT_TOTAL_VOLUME_FIELD,
} = require("../helpers/getUniSubgraphVolume");
const { CANDLE } = require("../helpers/chains");
const { getStartTimestamp } = require("../helpers/getStartTimestamp");

const v3Endpoints = {
  [CANDLE]:
    "https://thegraph.cndlchain.com/subgraphs/name/ianlapham/uniswap-v3-test",
};

const VOLUME_USD = "volumeUSD";

const v3Graphs = getChainVolume2({
  graphUrls: {
    ...v3Endpoints,
  },
  totalVolume: {
    factory: "factories",
    field: DEFAULT_TOTAL_VOLUME_FIELD,
  },
});

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CANDLE]: {
      fetch: v3Graphs(CANDLE),
      start: getStartTimestamp({
        endpoints: v3Endpoints,
        chain: CANDLE,
        volumeField: VOLUME_USD,
      }),
    },
  },
};

export default adapter;
