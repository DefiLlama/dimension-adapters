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
      fetch,
      start: '2023-12-31',
    },
  },
  deadFrom: '2025-02-01',
};

export default adapter;
