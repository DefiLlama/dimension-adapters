import { Adapter, ChainEndpoints, Fetch, IStartTimestamp, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";
import { postURL } from "../../utils/fetchURL";
import dailyVolumePayload from "./dailyVolumePayload";
import totalVolumePayload from "./totalVolumePayload";

/* const endpoints = {
  [CHAIN.ARBITRUM]: "https://api.dodoex.io/graphql?opname=FetchDashboardDailyData",
  [CHAIN.AURORA]: "https://api.dodoex.io/graphql?opname=FetchDashboardDailyData",
  [CHAIN.BSC]: "https://api.dodoex.io/graphql?opname=FetchDashboardDailyData",
  [CHAIN.ETHEREUM]: "https://api.dodoex.io/graphql?opname=FetchDashboardDailyData",
  [CHAIN.POLYGON]: "https://api.dodoex.io/graphql?opname=FetchDashboardDailyData",
  // [MOONRIVER]: "https://api.thegraph.com/subgraphs/name/dodoex/dodoex-v2-moonriver",
  // [AVAX]: "https://api.thegraph.com/subgraphs/name/dodoex/dodoex-v2-avax",
  // [BOBA]: "https://api.thegraph.com/subgraphs/name/dodoex/dodoex-v2-boba"
  // [HECO]: "https://n10.hg.network/subgraphs/name/dodoex-mine-v3-heco/heco",
  // [OKEXCHAIN]: "https://graph.kkt.one/subgraphs/name/dodoex/dodoex-v2-okchain",
} as ChainEndpoints */
const dailyEndpoint = "https://api.dodoex.io/graphql?opname=FetchDashboardDailyData&apikey=graphqldefiLlamadodoYzj5giof"
const totalEndpoint = "https://api.dodoex.io/graphql?opname=FetchDashboardInfoData&apikey=graphqldefiLlamadodoYzj5giof"
const chains = [
  CHAIN.ARBITRUM,
   CHAIN.BSC,
   CHAIN.ETHEREUM,
   CHAIN.POLYGON,
   CHAIN.AVAX,
   CHAIN.OPTIMISM,
   CHAIN.BASE,
   CHAIN.LINEA,
   CHAIN.SCROLL,
  //  CHAIN.MANTA
]

interface IDailyResponse {
  data: {
    dashboard_chain_day_data: {
      list: Array<{
        timestamp: number,
        volume: {
          [chain: string]: string
        }
      }>
    }
  }
}

interface ITotalResponse {
  data: {
    dashboard_pairs_count_data: {
      totalVolume: string
    }
  }
}

const getFetch = (chain: string): Fetch => async (timestamp: number) => {
  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000))
  const dailyResponse = (await postURL(dailyEndpoint, dailyVolumePayload(chain))) as IDailyResponse
  // const totalResponse = (await postURL(totalEndpoint, totalVolumePayload(chain))) as ITotalResponse

  return {
    timestamp: dayTimestamp,
    dailyVolume: dailyResponse.data.dashboard_chain_day_data.list.find((item: any) => item.timestamp === dayTimestamp)?.volume[chain],
    // totalVolume: totalResponse.data.dashboard_pairs_count_data.totalVolume
  }
}

const getStartTimestamp = (chain: string): IStartTimestamp => async () => {
  const response = (await postURL(dailyEndpoint, dailyVolumePayload(chain))) as IDailyResponse
  const firstDay = response.data.dashboard_chain_day_data.list.find((item: any) => item.volume[chain] !== '0')
  return firstDay?.timestamp ?? 0
}

const chainConversion = (chain: string): string => {
  switch (chain) {
    case CHAIN.SCROLL:
        return 'scr';
    case CHAIN.MANTA:
        return 'manta';
    case CHAIN.AVAX:
        return 'avalanche';
    default:
        return chain;
  }
}

const volume = chains.reduce(
  (acc, chain) => ({
    ...acc,
    [chain]: {
      fetch: getFetch(chainConversion(chain)),
      start: getStartTimestamp(chainConversion(chain))
    },
  }),
  {}
);

const adapter: SimpleAdapter = {
  adapter: volume
};
export default adapter;
