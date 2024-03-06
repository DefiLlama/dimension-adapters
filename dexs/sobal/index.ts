import { ChainEndpoints, BreakdownAdapter, BaseAdapter, SimpleAdapter } from "../../adapters/types";
import { getChainVolume } from "../../helpers/getUniSubgraphVolume";
import { CHAIN } from "../../helpers/chains";
import customBackfill from "../../helpers/customBackfill";
import { Chain } from "@defillama/sdk/build/general";

const endpoints: ChainEndpoints = {
  [CHAIN.NEON]: "https://neon-subgraph.sobal.fi/sobal-pools",
  [CHAIN.BASE]: "https://api.studio.thegraph.com/query/50526/sobal-base/version/latest",
};

const graphParams = {
  totalVolume: {
    factory: "balancers",
    field: "totalSwapVolume",
  },
  hasDailyVolume: false,
}

const graphs = getChainVolume({
  graphUrls: endpoints,
  ...graphParams
});

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.NEON]: {
      fetch: graphs(CHAIN.NEON),
      start: 1689613200, // 17TH JULY 5PM GMT
      customBackfill: customBackfill(CHAIN.NEON as Chain, graphs),
    },
    [CHAIN.BASE]: {
      fetch: graphs(CHAIN.BASE),
      start: 1690850000, // 1ST AUG 12:33 AM GMT
      customBackfill: customBackfill(CHAIN.BASE as Chain, graphs),
    }
  }
}

export default adapter;

// TODO custom backfill have to get specific block at start of each day
