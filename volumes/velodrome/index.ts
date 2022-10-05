import { SimpleAdapter } from "../../adapters/types";
import { getStartTimestamp } from "../../helpers/getStartTimestamp";
import { DEFAULT_DAILY_VOLUME_FIELD, DEFAULT_TOTAL_VOLUME_FIELD, getChainVolume } from "../../helpers/getUniSubgraphVolume";
import { CHAIN } from "../../helpers/chains";

const endpoints = {
  [CHAIN.OPTIMISM]: "https://api.thegraph.com/subgraphs/name/dmihal/velodrome",
};

const graphs = getChainVolume({
  graphUrls: endpoints,
  totalVolume: {
    factory: "factories",
    field: DEFAULT_TOTAL_VOLUME_FIELD,
  },
  dailyVolume: {
    factory: "dayData",
    field: DEFAULT_DAILY_VOLUME_FIELD,
  },
});

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.OPTIMISM]: {
      fetch: graphs(CHAIN.OPTIMISM),
      start: getStartTimestamp({
        endpoints: endpoints,
        chain: CHAIN.OPTIMISM,
        volumeField: DEFAULT_DAILY_VOLUME_FIELD,
        dailyDataField: "dayDatas"
      })
    },
  },
};

export default adapter;
