import { Chain } from "@defillama/sdk/build/general";
import { BreakdownAdapter, FetchOptions, FetchResultVolume } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getChainVolume, getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";
import fetchURL from "../../utils/fetchURL";

const endpoints = {
  [CHAIN.AVAX]: "https://api.thegraph.com/subgraphs/name/traderjoe-xyz/exchange",
  [CHAIN.BSC]: "https://api.thegraph.com/subgraphs/name/traderjoe-xyz/joe-v1-bnb",
  [CHAIN.ARBITRUM]: "https://api.thegraph.com/subgraphs/name/traderjoe-xyz/joe-v1-arbitrum",
};
type TEndpoint = {
  [s: string | Chain]: string;
}
const endpointsV2: TEndpoint = {
  [CHAIN.AVAX]: "https://api.thegraph.com/subgraphs/name/traderjoe-xyz/joe-v2",
  [CHAIN.ARBITRUM]: "https://barn.traderjoexyz.com/v1/dex/analytics/arbitrum?startTime=1672012800&aggregateBy=daily",
  [CHAIN.BSC]: "https://barn.traderjoexyz.com/v1/dex/analytics/binance?startTime=1677801600&aggregateBy=daily",
  [CHAIN.ETHEREUM]: "https://barn.traderjoexyz.com/v1/dex/analytics/ethereum?startTime=1695513600&aggregateBy=daily"
}

interface IVolume {
  timestamp: number;
  volumeUsd: number;
}
const fetchV2 = async (options: FetchOptions): Promise<FetchResultVolume> => {
  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(options.endTimestamp * 1000))
  const historicalVolume: IVolume[] = (await fetchURL(endpointsV2[options.chain]));
  const totalVolume = historicalVolume
    .filter(volItem => volItem.timestamp <= dayTimestamp)
    .reduce((acc, { volumeUsd }) => acc + Number(volumeUsd), 0)

  const dailyVolume = historicalVolume
    .find(dayItem => dayItem.timestamp === dayTimestamp)?.volumeUsd
  return {
    totalVolume: `${totalVolume}`,
    dailyVolume: dailyVolume !== undefined ? `${dailyVolume}` : undefined,
    timestamp: dayTimestamp,
  }
}

const graphsV1 = getChainVolume({
  graphUrls: endpoints,
  totalVolume: {
    factory: "factories",
    field: "volumeUSD",
  },
  dailyVolume: {
    factory: "dayData",
    field: "volumeUSD",
    dateField: "date"
  },
});


const graphsV2 = getChainVolume({
  graphUrls: endpointsV2,
  totalVolume: {
    factory: "lbfactories",
    field: "volumeUSD",
  },
  dailyVolume: {
    factory: "traderJoeDayData",
    field: "volumeUSD",
    dateField: "date"
  },
});

const adapter: BreakdownAdapter = {
  version: 2,
  breakdown: {
    v1: {
      [CHAIN.AVAX]: {
        fetch: graphsV1(CHAIN.AVAX),
        start: 1628467200,
      },
      [CHAIN.BSC]: {
        fetch: graphsV1(CHAIN.BSC),
        start: 1664841600,
      },
      [CHAIN.ARBITRUM]: {
        fetch: graphsV1(CHAIN.ARBITRUM),
        start: 1664841600,
      },
    },
    v2: {
      [CHAIN.AVAX]: {
        fetch: graphsV2(CHAIN.AVAX),
        start: 1668556800
      },
      [CHAIN.ARBITRUM]: {
        fetch: fetchV2,
        start: 1672012800
      },
      [CHAIN.BSC]: {
        fetch: fetchV2,
        start: 1677801600
      },
      [CHAIN.ETHEREUM]: {
        fetch: fetchV2,
        start: 1695513600
      }
    }
  },
};

export default adapter;
