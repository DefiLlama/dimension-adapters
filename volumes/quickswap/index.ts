import { SimpleAdapter } from "../../adapter.type";
import { CHAIN } from "../../helpers/chains";
import { getStartTimestamp } from "../../helpers/getStartTimestamp";
import { DEFAULT_DAILY_VOLUME_FACTORY, DEFAULT_DAILY_VOLUME_FIELD, DEFAULT_TOTAL_VOLUME_FACTORY, DEFAULT_TOTAL_VOLUME_FIELD, getChainVolume } from "../../helpers/getUniSubgraphVolume";

const endpoints = {
  [CHAIN.POLYGON]: "https://api.fura.org/subgraphs/name/quickswap",
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

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.POLYGON]: {
      fetch: graphs(CHAIN.POLYGON),
      start: getStartTimestamp({
        endpoints: endpoints,
        chain: CHAIN.POLYGON,
        volumeField: DEFAULT_DAILY_VOLUME_FIELD,
        dailyDataField: `${DEFAULT_DAILY_VOLUME_FACTORY}s`
      })
    },
  },
};

export default adapter;
