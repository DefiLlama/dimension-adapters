import { BreakdownAdapter, DISABLED_ADAPTER_KEY } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import disabledAdapter from "../../helpers/disabledAdapter";
const {
  getChainVolume,
  DEFAULT_TOTAL_VOLUME_FIELD,
  DEFAULT_DAILY_VOLUME_FIELD,
} = require("../../helpers/getUniSubgraphVolume");
const { getStartTimestamp } = require("../../helpers/getStartTimestamp");
const endpoints = {
  [CHAIN.METER]: "https://graph-meter.voltswap.finance/subgraphs/name/meterio/voltswapv2-subgraph",
};

const DAILY_VOLUME_FACTORY = "uniswapDayData";

const graphs = getChainVolume({
  graphUrls: endpoints,
  totalVolume: {
    factory: "uniswapFactories",
    field: DEFAULT_TOTAL_VOLUME_FIELD,
  },
  dailyVolume: {
    factory: DAILY_VOLUME_FACTORY,
    field: DEFAULT_DAILY_VOLUME_FIELD,
  },
});

const adapter: BreakdownAdapter = {
  version: 2,
  breakdown: {
    v1: {
      [DISABLED_ADAPTER_KEY]: disabledAdapter,
      [CHAIN.METER]: disabledAdapter
    },
    v2: {
      [CHAIN.METER]: {
        fetch: graphs(CHAIN.METER),
        start: getStartTimestamp({
          endpoints,
          chain: CHAIN.METER,
          dailyDataField: `${DAILY_VOLUME_FACTORY}s`,
        }),
      }
    },
  },
};

export default adapter;
