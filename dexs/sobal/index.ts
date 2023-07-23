import { ChainEndpoints, BreakdownAdapter, BaseAdapter } from "../../adapters/types";
import { getChainVolume } from "../../helpers/getUniSubgraphVolume";
import customBackfill from "../../helpers/customBackfill";
import { CHAIN } from "../../helpers/chains";
import { Chain } from "@defillama/sdk/build/general";
import { getStartTimestamp } from "../../helpers/getStartTimestamp";

const endpoints: ChainEndpoints = {
  [CHAIN.NEON]:
  "https://neon-subgraph.sobal.fi/sobal-pools",
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

const adapter: BreakdownAdapter = {
  breakdown: {
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
