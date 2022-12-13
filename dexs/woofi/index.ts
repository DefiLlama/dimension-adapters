import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const { getChainVolume } = require("../../helpers/getUniSubgraphVolume");
const { getStartTimestamp } = require("../../helpers/getStartTimestamp");

const endpoints = {
  [CHAIN.AVAX]: "https://api.thegraph.com/subgraphs/name/woonetwork/woofi-avax",
  [CHAIN.BSC]: "https://api.thegraph.com/subgraphs/name/woonetwork/woofi-bsc",
  [CHAIN.FANTOM]: "https://api.thegraph.com/subgraphs/name/woonetwork/woofi-fantom",
  [CHAIN.POLYGON]: "https://api.thegraph.com/subgraphs/name/woonetwork/woofi-polygon",
  [CHAIN.ARBITRUM]: "https://api.thegraph.com/subgraphs/name/woonetwork/woofi-arbitrum",
  [CHAIN.OPTIMISM]: "https://api.thegraph.com/subgraphs/name/woonetwork/woofi-optimism",
};

const TOTAL_VOLUME_FACTORY = "globalVariables";
const TOTAL_VOLUME_FIELD = "realTotalVolumeUSD";

const DAILY_VOLUME_FACTORY = "dayData";
const DAILY_VOLUME_FIELD = "realVolumeUSD";

const graphs = getChainVolume({
  graphUrls: endpoints,
  totalVolume: {
    factory: TOTAL_VOLUME_FACTORY,
    field: TOTAL_VOLUME_FIELD,
  },
  dailyVolume: {
    factory: DAILY_VOLUME_FACTORY,
    field: DAILY_VOLUME_FIELD,
  },
});

const startTimeQuery = {
  endpoints,
  dailyDataField: `${DAILY_VOLUME_FACTORY}s`,
  volumeField: DAILY_VOLUME_FIELD,
};

const volume = Object.keys(endpoints).reduce(
  (acc, chain) => ({
    ...acc,
    [chain]: {
      fetch: graphs(chain),
      start: getStartTimestamp({ ...startTimeQuery, chain }),
    },
  }),
  {}
);

const adapter: SimpleAdapter = {
  adapter: volume,
};
export default adapter;
