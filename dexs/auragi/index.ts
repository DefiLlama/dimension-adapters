import * as sdk from "@defillama/sdk";
import { SimpleAdapter } from "../../adapters/types";
import { getStartTimestamp } from "../../helpers/getStartTimestamp";
import { DEFAULT_DAILY_VOLUME_FIELD, DEFAULT_TOTAL_VOLUME_FIELD, getChainVolume } from "../../helpers/getUniSubgraphVolume";
import { CHAIN } from "../../helpers/chains";

const endpoints = {
  [CHAIN.ARBITRUM]: sdk.graph.modifyEndpoint('DtNQcRXx82k4azEb5QvUjRbmXSNLTUsUePzPY6PtryEc'),
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
    [CHAIN.ARBITRUM]: {
      fetch: graphs(CHAIN.ARBITRUM),
      start: getStartTimestamp({
        endpoints: endpoints,
        chain: CHAIN.ARBITRUM,
        volumeField: DEFAULT_DAILY_VOLUME_FIELD,
        dailyDataField: "dayDatas"
      })
    },
  },
};

export default adapter;
