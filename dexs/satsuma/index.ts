import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getChainVolume } from "../../helpers/getUniSubgraphVolume";

const endpoints = {
  [CHAIN.CITREA]: "https://api.goldsky.com/api/public/project_cmamb6kkls0v2010932jjhxj4/subgraphs/analytics-mainnet/v1.0.3/gn"
};

const graphs = getChainVolume({
  graphUrls: endpoints,
  totalVolume: {
    factory: "factories",
    field: "totalVolumeUSD",
  },
  dailyVolume: {
    factory: "algebraDayData",
    field: "volumeUSD",
    dateField: "date"
  },
  hasDailyVolume: true,
});

const adapter: SimpleAdapter = {
  version: 1,
  adapter: {
    [CHAIN.CITREA]: {
      fetch: graphs(CHAIN.CITREA),
      start: "2026-01-17",
    },
  },
};

export default adapter;
