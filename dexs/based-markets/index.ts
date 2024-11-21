import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getGraphDimensions2 } from "../../helpers/getUniSubgraph";

const fetch = getGraphDimensions2({
  graphUrls: {
    [CHAIN.BASE]: 'https://api.studio.thegraph.com/query/62454/analytics_base_8_2/version/latest',
  },
  totalVolume: {
    factory: "totalHistories",
    field: 'tradeVolume'
  },
  totalFees: {
    factory: "totalHistories",
    field: 'platformFee'
  },
});

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.BASE]: {
      fetch: fetch(CHAIN.BASE),
      start: '2023-12-31',
    },
  },
};

export default adapter;
