import { ChainEndpoints, DISABLED_ADAPTER_KEY, SimpleAdapter } from "../../adapters/types";
import { getChainVolume } from "../../helpers/getUniSubgraphVolume";
import customBackfill from "../../helpers/customBackfill";
import { CHAIN } from "../../helpers/chains";
import { Chain } from "@defillama/sdk/build/general";
import { getStartTimestamp } from "../../helpers/getStartTimestamp";
import disabledAdapter from "../../helpers/disabledAdapter";

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
  version: 2,
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
adapter.adapter[DISABLED_ADAPTER_KEY] = disabledAdapter;
export default adapter;
