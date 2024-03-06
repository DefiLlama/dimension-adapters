import { IJSON, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

import { getGraphDimensions } from "../../helpers/getUniSubgraph";

const v3Endpoint = {
  [CHAIN.BASE]:
    "https://api.studio.thegraph.com/query/50473/exchange-clmm/version/latest",
  [CHAIN.OPTIMISM]:
    "https://api.studio.thegraph.com/query/50473/v3-optimism/version/latest",
  [CHAIN.ARBITRUM]:
    "https://api.studio.thegraph.com/query/50473/v3-arbitrum/version/latest",
};

const VOLUME_USD = "volumeUSD";

const v3Graph = getGraphDimensions({
  graphUrls: v3Endpoint,
  totalVolume: {
    factory: "factories",
  },
  dailyVolume: {
    factory: "pancakeDayData",
    field: VOLUME_USD,
  },
  totalFees: {
    factory: "factories",
  },
  dailyFees: {
    factory: "pancakeDayData",
    field: "feesUSD",
  },
});

const v3StartTimes = {
  [CHAIN.BASE]: 1691712000,
  [CHAIN.OPTIMISM]: 1705993200,
  [CHAIN.ARBITRUM]: 1707885300,
} as IJSON<number>;

const adapter: SimpleAdapter = { adapter: {}, version: 2 };

Object.keys(v3StartTimes).map((chain: string) => {
  adapter.adapter[chain] = {
    fetch: v3Graph(chain),
    start: v3StartTimes[chain],
  };
});

export default adapter;
