import { BreakdownAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { DEFAULT_DAILY_VOLUME_FACTORY, DEFAULT_DAILY_VOLUME_FIELD, DEFAULT_TOTAL_VOLUME_FACTORY, DEFAULT_TOTAL_VOLUME_FIELD, getChainVolume } from "../../helpers/getUniSubgraphVolume";

const endpoints = {
  [CHAIN.ARBITRUM]: "https://api.thegraph.com/subgraphs/name/zyberswap-arbitrum/zyber-amm",
};

const graphs = getChainVolume({
  graphUrls: endpoints,
  totalVolume: {
    factory: DEFAULT_TOTAL_VOLUME_FACTORY,
    field: DEFAULT_TOTAL_VOLUME_FIELD,
  },
  dailyVolume: {
    factory: DEFAULT_DAILY_VOLUME_FACTORY,
    field: DEFAULT_DAILY_VOLUME_FIELD,
    dateField: "date"
  },
});

const endpointsV3 = {
  [CHAIN.ARBITRUM]: "https://api.thegraph.com/subgraphs/name/iliaazhel/zyberswap-info",
};
const graphsV3 = getChainVolume({
  graphUrls: endpointsV3,
  totalVolume: {
    factory: "factories",
    field: "totalVolumeUSD",
  },
  dailyVolume: {
    factory: "algebraDayData",
    field: "volumeUSD",
    dateField: "date"
  },
});

const endpointsStable = {
  [CHAIN.ARBITRUM]: "https://api.thegraph.com/subgraphs/name/zyberswap-arbitrum/zyber-stableamm"
};

const graphsStable = getChainVolume({
  graphUrls: endpointsStable,
  totalVolume: {
    factory: "tradeVolumes",
    field: "volume",
  },
  dailyVolume: {
    factory: "dailyVolume",
    field: "volume",
    dateField: "timestamp"
  },
});


const adapter: BreakdownAdapter = {
  version: 2,
  breakdown: {
    v2: {
      [CHAIN.ARBITRUM]: {
        fetch: graphs(CHAIN.ARBITRUM),
        start: 1674432000
      },
    },
    v3: {
      [CHAIN.ARBITRUM]: {
        fetch: graphsV3(CHAIN.ARBITRUM),
        start: 1676887200
      },
    },
    stable: {
      [CHAIN.ARBITRUM]: {
        fetch: graphsStable(CHAIN.ARBITRUM),
        start: 1676113200,
      },
    }
  },
};

export default adapter;
