import { SimpleAdapter } from "../../adapters/types";
import { ETHEREUM } from "../../helpers/chains";
import { getStartTimestamp } from "../../helpers/getStartTimestamp";
import { DEFAULT_TOTAL_VOLUME_FIELD, getChainVolume2 } from "../../helpers/getUniSubgraphVolume";

const endpoints = {
  [ETHEREUM]:
    "https://api.thegraph.com/subgraphs/name/1inch-exchange/oneinch-liquidity-protocol-v2",
};

const graphs = getChainVolume2({
  graphUrls: {
    [ETHEREUM]: endpoints[ETHEREUM],
  },
  totalVolume: {
    factory: "mooniswapFactories",
    field: DEFAULT_TOTAL_VOLUME_FIELD,
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
        dailyDataField: `mooniswapDayDatas`,
      }),
    },
  },
};

export default adapter;
