import { Chain } from "@defillama/sdk/build/general";
import { ChainBlocks, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const { getChainVolume } = require("../../helpers/getUniSubgraphVolume");

const endpoints = {
  [CHAIN.AVAX]: "https://api.thegraph.com/subgraphs/name/woonetwork/woofi-avax",
  [CHAIN.BSC]: "https://api.thegraph.com/subgraphs/name/woonetwork/woofi-bsc",
  [CHAIN.FANTOM]: "https://api.thegraph.com/subgraphs/name/woonetwork/woofi-fantom",
  [CHAIN.POLYGON]: "https://api.thegraph.com/subgraphs/name/woonetwork/woofi-polygon",
  [CHAIN.ARBITRUM]: "https://api.thegraph.com/subgraphs/name/woonetwork/woofi-arbitrum",
  [CHAIN.OPTIMISM]: "https://api.thegraph.com/subgraphs/name/woonetwork/woofi-optimism",
  [CHAIN.ERA]: "https://api.studio.thegraph.com/query/45576/woofi-zksync/version/latest",
  [CHAIN.POLYGON_ZKEVM]: "https://api.studio.thegraph.com/query/45576/woofi-polygon-zkevm/version/latest",
  [CHAIN.LINEA]: "https://woofi-subgraph.mer1in.com/subgraphs/name/woonetwork/woofi-linea",
  [CHAIN.BASE]: "https://api.studio.thegraph.com/query/45576/woofi-base/version/latest",
  [CHAIN.MANTLE]: "https://woofi-subgraph.mer1in.com/subgraphs/name/woonetwork/woofi-mantle",
};

type TStartTime = {
  [l: string | Chain]: number;
}
const startTime: TStartTime = {
  [CHAIN.AVAX]: 1645228800,
  [CHAIN.BSC]: 1635206400,
  [CHAIN.FANTOM]: 1649808000,
  [CHAIN.POLYGON]: 1656028800,
  [CHAIN.ARBITRUM]: 1667520000,
  [CHAIN.OPTIMISM]: 1669161600,
  [CHAIN.ERA]: 1680652800,
  [CHAIN.POLYGON_ZKEVM]: 1688515200,
  [CHAIN.LINEA]: 1691625600,
  [CHAIN.BASE]: 1692057600,
  [CHAIN.MANTLE]: 1706659200,
};

const TOTAL_VOLUME_FACTORY = "globalVariables";
const TOTAL_VOLUME_FIELD = "totalVolumeUSD";

const DAILY_VOLUME_FACTORY = "dayData";
const DAILY_VOLUME_FIELD = "volumeUSD";

const graphs = getChainVolume({
  graphUrls: endpoints,
  totalVolume: {
    factory: TOTAL_VOLUME_FACTORY,
    field: TOTAL_VOLUME_FIELD,
  },
  dailyVolume: {
    factory: DAILY_VOLUME_FACTORY,
    field: DAILY_VOLUME_FIELD,
    dateField: 'timestamp'
  },
});

const fetch = (chain: string) => {
  return async (timestamp: number, chainBlocks: ChainBlocks) => {
    const result = await graphs(chain)(timestamp, chainBlocks);
    if (!result) return {};
    return {
      ...result,
      totalVolume: `${result.totalVolume / 10 ** 18}`,
      dailyVolume:  `${result.dailyVolume  / 10 ** 18}`
    };
  }
}

const volume = Object.keys(endpoints).reduce(
  (acc, chain) => ({
    ...acc,
    [chain]: {
      fetch: fetch(chain),
      start: startTime[chain],
    },
  }),
  {}
);

const adapter: SimpleAdapter = {
  version: 2,
  adapter: volume,
};
export default adapter;
