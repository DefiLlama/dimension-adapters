import * as sdk from "@defillama/sdk";
import { IJSON, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getGraphDimensions2 } from "../../helpers/getUniSubgraph";

const v3Endpoint = {
  [CHAIN.BASE]:
    sdk.graph.modifyEndpoint('HRaFknkbRxB17ziZoMcT7EJuT42BKRYeYvKyQvJrQWJf'),
};

const v3Graph = getGraphDimensions2({
  graphUrls: v3Endpoint,
  totalVolume: {
    factory: "factories",
  },
  totalFees: {
    factory: "factories",
  },
});

const v3StartTimes = {
  [CHAIN.BASE]: 1691712000,
} as IJSON<number>;

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.BASE]: {
      fetch: v3Graph(CHAIN.BASE),
      start: v3StartTimes[CHAIN.BASE]
    },
  },
};

export default adapter;
