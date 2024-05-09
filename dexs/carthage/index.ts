import { BreakdownAdapter } from "../../adapters/types";

const {
  getChainVolume,
  DEFAULT_DAILY_VOLUME_FACTORY,
  DEFAULT_TOTAL_VOLUME_FIELD,
} = require("../../helpers/getUniSubgraphVolume");

const { CANDLE } = require("../../helpers/chains");

const { getStartTimestamp } = require("../../helpers/getStartTimestamp");


const v3Endpoints = {
  [CANDLE]:
    "https://thegraph.cndlchain.com/subgraphs/name/ianlapham/uniswap-v3-test",
};

const VOLUME_USD = "volumeUSD";

const v3Graphs = getChainVolume({
  graphUrls: {
    ...v3Endpoints,
  },
  totalVolume: {
    factory: "factories",
    field: DEFAULT_TOTAL_VOLUME_FIELD,
  },
  dailyVolume: {
    factory: DEFAULT_DAILY_VOLUME_FACTORY,
    field: VOLUME_USD,
  },
});

const adapter: BreakdownAdapter = {
  version: 2,
  breakdown: {
    v3: {
      [CANDLE]: {
        fetch: v3Graphs(CANDLE),
        start: getStartTimestamp({
          endpoints: v3Endpoints,
          chain: CANDLE,
          volumeField: VOLUME_USD,
        })
      }
    },
  },
};

export default adapter;
