import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import customBackfill, { IGraphs } from "../../helpers/customBackfill";
import { getChainVolume2 } from "../../helpers/getUniSubgraphVolume";

const endpoints = {
  [CHAIN.VELAS]: "https://testeborabora.cyou/subgraphs/name/wavelength22"
}
const graphs = getChainVolume2({
  graphUrls: endpoints,
  totalVolume: {
    factory: "balancers",
    field: "totalSwapVolume",
  },
});

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.VELAS]: {
      fetch: graphs(CHAIN.VELAS),
      start: '2022-10-20',
      customBackfill: customBackfill(CHAIN.VELAS, graphs as unknown as IGraphs)
    },
  },
};

export default adapter;
