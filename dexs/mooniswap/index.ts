import { SimpleAdapter } from "../../adapters/types";
import { ETHEREUM } from "../../helpers/chains";
import { getStartTimestamp } from "../../helpers/getStartTimestamp";
import { DEFAULT_DAILY_VOLUME_FIELD, DEFAULT_TOTAL_VOLUME_FIELD, getChainVolume } from "../../helpers/getUniSubgraphVolume";

const endpoints = {
  [ETHEREUM]:
    "https://api.thegraph.com/subgraphs/name/1inch-exchange/oneinch-liquidity-protocol-v2",
};

const dailyDataFactory = "mooniswapDayData";

const graphs = getChainVolume({
  graphUrls: {
    [ETHEREUM]: endpoints[ETHEREUM],
  },
  totalVolume: {
    factory: "mooniswapFactories",
    field: DEFAULT_TOTAL_VOLUME_FIELD,
  },
  dailyVolume: {
    factory: dailyDataFactory,
    field: DEFAULT_DAILY_VOLUME_FIELD,
  },
});

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [ETHEREUM]: {
      fetch: graphs(ETHEREUM),
      start: getStartTimestamp({
        endpoints,
        chain: ETHEREUM,
        dailyDataField: `${dailyDataFactory}s`,
      }),
    },
  },
};

export default adapter;
