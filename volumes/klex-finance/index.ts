import { ChainEndpoints, SimpleAdapter } from "../../adapter.type";
import { getChainVolume } from "../../helpers/getUniSubgraphVolume";
import customBackfill from "../../helpers/customBackfill";
import { CHAIN } from "../../helpers/chains";
import { Chain } from "@defillama/sdk/build/general";
import { getStartTimestamp } from "../../helpers/getStartTimestamp";

const endpoints: ChainEndpoints = {
  [CHAIN.KLAYTN]: "https://graph-prod.klex.finance/subgraphs/name/klex-staging-2-mainnet",
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
  adapter: Object.keys(endpoints).reduce((acc, chain: any) => {
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
  }, {})
};

export default adapter;
