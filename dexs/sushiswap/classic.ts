import { Chain } from "@defillama/sdk/build/general";
import { getChainVolume } from "../../helpers/getUniSubgraphVolume";
import { getStartTimestamp } from "../../helpers/getStartTimestamp";
import {
  CHAIN,
} from "../../helpers/chains";

const endpointsClassic = {
  [CHAIN.ETHEREUM]: "https://api.thegraph.com/subgraphs/name/sushiswap/exchange",
  [CHAIN.BSC]: "https://api.thegraph.com/subgraphs/name/sushiswap/bsc-exchange",
  [CHAIN.POLYGON]: "https://api.thegraph.com/subgraphs/name/sushiswap/matic-exchange",
  [CHAIN.FANTOM]: "https://api.thegraph.com/subgraphs/name/sushiswap/fantom-exchange",
  [CHAIN.ARBITRUM]: "https://api.thegraph.com/subgraphs/name/sushiswap/arbitrum-exchange",
  [CHAIN.CELO]: "https://api.thegraph.com/subgraphs/name/sushiswap/celo-exchange",
  [CHAIN.AVAX]: "https://api.thegraph.com/subgraphs/name/sushiswap/avalanche-exchange",
  [CHAIN.HARMONY]: "https://api.thegraph.com/subgraphs/name/sushiswap/harmony-exchange",
  [CHAIN.MOONRIVER]: "https://api.thegraph.com/subgraphs/name/sushiswap/moonriver-exchange",
  [CHAIN.XDAI]: "https://api.thegraph.com/subgraphs/name/sushiswap/xdai-exchange",
  [CHAIN.MOONBEAM]: 'https://api.thegraph.com/subgraphs/name/sushiswap/exchange-moonbeam',
  [CHAIN.BOBA]: 'https://api.thegraph.com/subgraphs/name/sushi-0m/sushiswap-boba',
  [CHAIN.FUSE]: 'https://api.thegraph.com/subgraphs/name/sushiswap/exchange-fuse',
};

const VOLUME_FIELD = "volumeUSD";

const graphsClassic = getChainVolume({
  graphUrls: endpointsClassic,
  totalVolume: {
    factory: "factories",
    field: VOLUME_FIELD,
  },
  dailyVolume: {
    factory: "dayData",
    field: VOLUME_FIELD,
  },
});

const graphsClassicBoba = getChainVolume({
  graphUrls: endpointsClassic,
  totalVolume: {
    factory: "factories",
    field: VOLUME_FIELD,
  },
  dailyVolume: {
    factory: "factoryDaySnapshot",
    field: VOLUME_FIELD,
    dateField: "date"
  },
});

const startTimeQueryClassic = {
  endpoints: endpointsClassic,
  dailyDataField: "dayDatas",
  volumeField: VOLUME_FIELD,
};

const classic = Object.keys(endpointsClassic).reduce(
  (acc, chain) => ({
    ...acc,
    [chain]: {
      fetch: chain == "boba" ? graphsClassicBoba(chain as Chain) : graphsClassic(chain as Chain),
      start: chain == "boba" ? getStartTimestamp({ ...startTimeQueryClassic, dailyDataField: "factoryDaySnapshots", chain }) : getStartTimestamp({ ...startTimeQueryClassic, chain }),
    },
  }),
  {}
);

export default classic