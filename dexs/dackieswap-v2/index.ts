import customBackfill from "../../helpers/customBackfill";
import {CHAIN} from "../../helpers/chains";
import type {ChainEndpoints, SimpleAdapter} from "../../adapters/types";
import type {Chain} from "@defillama/sdk/build/general";
import { getGraphDimensions2} from "../../helpers/getUniSubgraph";

// Subgraphs endpoints
const endpoints: ChainEndpoints = {
  [CHAIN.BASE]: "https://api.studio.thegraph.com/query/50473/v2-base/version/latest",
  [CHAIN.OPTIMISM]: "https://api.studio.thegraph.com/query/50473/v2-optimism/version/latest",
  [CHAIN.ARBITRUM]: "https://api.studio.thegraph.com/query/50473/v2-arbitrum/version/latest",
  [CHAIN.BLAST]: "https://api.studio.thegraph.com/query/50473/v2-blast/version/latest",
  [CHAIN.MODE]: "https://api.studio.thegraph.com/query/50473/v2-mode/version/latest",
  [CHAIN.XLAYER]: "https://api.studio.thegraph.com/query/50473/v2-xlayer/version/latest",
  [CHAIN.LINEA]: "https://api.studio.thegraph.com/query/50473/v2-linea/version/latest",
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
            chain === CHAIN.BASE ? 1690173000
                : chain === CHAIN.OPTIMISM ? 1705993200
                    : chain === CHAIN.ARBITRUM ? 1707885300
                        : chain === CHAIN.BLAST ? 1709722800
                            : chain === CHAIN.MODE ? 1712371653
                              : chain === CHAIN.XLAYER ? 1712369493
                                  : chain === CHAIN.LINEA ? 1725062400
                                        : 0,
        customBackfill: customBackfill(chain, graphs),
        meta: {methodology},
      }
    }
  }, {})
};

export default adapter;
