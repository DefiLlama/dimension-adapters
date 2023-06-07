import { ChainEndpoints, BreakdownAdapter, BaseAdapter } from "../../adapters/types";
import { getChainVolume } from "../../helpers/getUniSubgraphVolume";
import customBackfill from "../../helpers/customBackfill";
import { CHAIN } from "../../helpers/chains";
import { Chain } from "@defillama/sdk/build/general";
import { getStartTimestamp } from "../../helpers/getStartTimestamp";

const endpoints: ChainEndpoints = {
  [CHAIN.ETHEREUM]: "https://api.thegraph.com/subgraphs/name/balancer-labs/balancer-v2",
  [CHAIN.POLYGON]:
    "https://api.thegraph.com/subgraphs/name/balancer-labs/balancer-polygon-v2",
  [CHAIN.ARBITRUM]:
    "https://api.thegraph.com/subgraphs/name/balancer-labs/balancer-arbitrum-v2",
  [CHAIN.XDAI]: "https://api.thegraph.com/subgraphs/name/balancer-labs/balancer-gnosis-chain-v2"
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

const v1graphs = getChainVolume({
  graphUrls: {
    [CHAIN.ETHEREUM]: "https://api.thegraph.com/subgraphs/name/balancer-labs/balancer"
  },
  ...graphParams
});

const adapter: BreakdownAdapter = {
  breakdown: {
    v1: {
      [CHAIN.ETHEREUM]: {
        fetch: v1graphs(CHAIN.ETHEREUM),
        start: async () => 1582761600,
        customBackfill: customBackfill(CHAIN.ETHEREUM, v1graphs)
      },
    },
    v2: Object.keys(endpoints).reduce((acc, chain) => {
      return {
        ...acc,
        [chain]: {
          fetch: graphs(chain as Chain),
          customBackfill: customBackfill(chain as Chain, graphs),
          start: getStartTimestamp({
            endpoints,
            chain: chain,
            dailyDataField: `balancerSnapshots`,
            dateField: 'timestamp',
            volumeField: 'totalSwapVolume'
          }),
        }
      }
    }, {} as BaseAdapter)
  }
}

export default adapter;

// TODO custom backfill have to get specific block at start of each day
