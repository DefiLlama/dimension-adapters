import { Fetch, FetchOptions, IStartTimestamp, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";
import { postURL } from "../../utils/fetchURL";
import dailyVolumePayload from "./dailyVolumePayload";

/* const endpoints = {
  [CHAIN.ARBITRUM]: "https://api.dodoex.io/graphql?opname=FetchDashboardDailyData",
  [CHAIN.AURORA]: "https://api.dodoex.io/graphql?opname=FetchDashboardDailyData",
  [CHAIN.BSC]: "https://api.dodoex.io/graphql?opname=FetchDashboardDailyData",
  [CHAIN.ETHEREUM]: "https://api.dodoex.io/graphql?opname=FetchDashboardDailyData",
  [CHAIN.POLYGON]: "https://api.dodoex.io/graphql?opname=FetchDashboardDailyData",
  // [MOONRIVER]: sdk.graph.modifyEndpoint('G4HFPFJue7zf2BktJuKETh72DscimLJRybVA6iD6A7yM'),
  // [AVAX]: sdk.graph.modifyEndpoint('8GUXi8PNrW4ACf968KCWxH9AkeNt8YEQin7MDa7RuULW'),
  // [BOBA]: sdk.graph.modifyEndpoint('6PVfSucTfTimvx3aMgWsatmRDBNxW7yQKayyZ7Mxrf73')
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

const getFetch = (chain: string): Fetch => async (_ts: number, _t: any, options: FetchOptions) => {
  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(options.startOfDay * 1000))
  const dailyResponse = (await postURL(dailyEndpoint, dailyVolumePayload(chain))) as IDailyResponse

  return {
    dailyVolume: dailyResponse.data.dashboard_chain_day_data.list.find((item: any) => item.timestamp === dayTimestamp)?.volume[chain],
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


export default adapter
