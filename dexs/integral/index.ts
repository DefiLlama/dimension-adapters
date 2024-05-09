import { BaseAdapter, SimpleAdapter } from "../../adapters/types";
import { getStartTimestamp } from "../../helpers/getStartTimestamp";
import {
  DEFAULT_DAILY_VOLUME_FIELD,
  DEFAULT_TOTAL_VOLUME_FIELD,
  getChainVolume,
} from "../../helpers/getUniSubgraphVolume";
import { CHAIN } from "../../helpers/chains";
import { Chain } from "@defillama/sdk/build/general";

export const chains = [
  CHAIN.ARBITRUM,
  CHAIN.ETHEREUM
];
export const endpoints = {
  [CHAIN.ETHEREUM]:
    "https://api.thegraph.com/subgraphs/name/integralhq/integral-size",
  [CHAIN.ARBITRUM]:
    "https://api.thegraph.com/subgraphs/name/integralhq/integral-size-arbitrum",
};

const graphs = getChainVolume({
  graphUrls: endpoints,
  totalVolume: {
    factory: "factories",
    field: DEFAULT_TOTAL_VOLUME_FIELD,
  },
  dailyVolume: {
    factory: "dayData",
    field: DEFAULT_DAILY_VOLUME_FIELD,
  },
});

const adapter: SimpleAdapter = {
  version: 2,
  adapter: chains.reduce((acc, chain) => {
    return {
      ...acc,
      [chain]: {
        fetch: graphs(chain as Chain),
        start: getStartTimestamp({
          endpoints: endpoints,
          chain,
          volumeField: DEFAULT_DAILY_VOLUME_FIELD,
          dailyDataField: "dayDatas",
        }),
      },
    };
  }, {} as BaseAdapter),
};

export default adapter;
