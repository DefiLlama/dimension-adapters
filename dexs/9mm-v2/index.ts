import customBackfill from "../../helpers/customBackfill";
import {CHAIN} from "../../helpers/chains";
import type {ChainEndpoints, SimpleAdapter} from "../../adapters/types";
import type {Chain} from "@defillama/sdk/build/general";
import { getGraphDimensions2} from "../../helpers/getUniSubgraph";

// Subgraphs endpoints
const endpoints: ChainEndpoints = {
  [CHAIN.PULSECHAIN]: "https://graph.9mm.pro/subgraphs/name/pulsechain/9mm",
  [CHAIN.BASE]: "https://api.studio.thegraph.com/query/80328/9mmbasev2/version/latest",
};

// Fetch function to query the subgraphs
const graphs = getGraphDimensions2({
  graphUrls: endpoints,
  totalVolume: {
    factory: "pancakeFactories",
    field: "totalVolumeUSD",
  },
  feesPercent: {
    type: "volume",
    UserFees: 0.25,
    SupplySideRevenue: 0.17,
    ProtocolRevenue: 0.08,
    Revenue: 0.25,
    Fees: 0.25,
  }
});

const methodology = {
  UserFees: "User pays 0.25% fees on each swap.",
  SupplySideRevenue: "LPs receive 0.17% of each swap.",
  ProtocolRevenue: "Treasury receives 0.08% of each swap.",
  Revenue: "All revenue generated comes from user fees.",
  Fees: "All fees comes from the user.",
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: Object.keys(endpoints).reduce((acc, chain) => {
    return {
      ...acc,
      [chain]: {
        fetch: graphs(chain as Chain),
        start: async () =>
            chain === CHAIN.PULSECHAIN ? 1698693960
                : chain === CHAIN.BASE ? 1718210460
                    : 0,
        customBackfill: customBackfill(chain, graphs),
        meta: {methodology},
      }
    }
  }, {})
};

export default adapter;