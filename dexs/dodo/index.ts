import { Adapter, ChainEndpoints, Fetch, IStartTimestamp, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";
import { postURL } from "../../utils/fetchURL";
import dailyVolumePayload from "./dailyVolumePayload";
import totalVolumePayload from "./totalVolumePayload";

/* const endpoints = {
  [CHAIN.ARBITRUM]: "https://gateway.dodoex.io/graphql?opname=FetchDashboardDailyData",
  [CHAIN.AURORA]: "https://gateway.dodoex.io/graphql?opname=FetchDashboardDailyData",
  [CHAIN.BSC]: "https://gateway.dodoex.io/graphql?opname=FetchDashboardDailyData",
  [CHAIN.ETHEREUM]: "https://gateway.dodoex.io/graphql?opname=FetchDashboardDailyData",
  [CHAIN.POLYGON]: "https://gateway.dodoex.io/graphql?opname=FetchDashboardDailyData",
  // [MOONRIVER]: "https://api.thegraph.com/subgraphs/name/dodoex/dodoex-v2-moonriver",
  // [AVAX]: "https://api.thegraph.com/subgraphs/name/dodoex/dodoex-v2-avax",
  // [BOBA]: "https://api.thegraph.com/subgraphs/name/dodoex/dodoex-v2-boba"
  // [HECO]: "https://n10.hg.network/subgraphs/name/dodoex-mine-v3-heco/heco",
  // [OKEXCHAIN]: "https://graph.kkt.one/subgraphs/name/dodoex/dodoex-v2-okchain",
} as ChainEndpoints */
const dailyEndpoint = "https://gateway.dodoex.io/graphql?opname=FetchDashboardDailyData"
const totalEndpoint = "https://gateway.dodoex.io/graphql?opname=FetchDashboardInfoData"
const chains = [CHAIN.ARBITRUM, CHAIN.AURORA, CHAIN.BSC, CHAIN.ETHEREUM, CHAIN.POLYGON]

interface IDailyResponse {
  data: {
    dashboard_chain_day_data: {
      list: Array<{
        timestamp: number,
        volume: {
          [chain: string]: string
        }
      }>,
      volume_near24h: {
        [chain: string]: string
      }
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
  const dailyResponse = (await postURL(dailyEndpoint, dailyVolumePayload(chain))).data as IDailyResponse
  // const totalResponse = (await postURL(totalEndpoint, totalVolumePayload(chain))).data as ITotalResponse
  console.log("DODO volume debug:", JSON.stringify(dailyResponse, null, 2))
  const dailyData = dailyResponse.data.dashboard_chain_day_data.list.find((item: any) => item.timestamp === dayTimestamp);
  const dailyVolume = dailyData?.volume[chain];
  if (dailyData && dailyVolume === '0') {
    delete dailyData.volume['__typename'];
    // If the transaction volume data of all chains on the current day is 0, it means that the data acquisition failed, 
    // and the error status is returned directly, and the data will be retrieved after a period of time 
    const checkResult = Object.values(dailyData.volume).every(volume => volume === '0');
    if (checkResult) {
      throw new Error(`Normal data of current time ${timestamp} is not obtained`)
    }
  }
  
  return {
    timestamp: dayTimestamp,
    dailyVolume,
    // totalVolume: totalResponse.data.dashboard_pairs_count_data.totalVolume
  }
}

const getStartTimestamp = (chain: string): IStartTimestamp => async () => {
  const response = (await postURL(dailyEndpoint, dailyVolumePayload(chain))).data as IDailyResponse
  const firstDay = response.data.dashboard_chain_day_data.list.find((item: any) => item.volume[chain] !== '0')
  return firstDay?.timestamp ?? 0
}

const volume = chains.reduce(
  (acc, chain) => ({
    ...acc,
    [chain]: {
      fetch: getFetch(chain),
      start: getStartTimestamp(chain)
    },
  }),
  {}
);

const adapter: SimpleAdapter = {
  adapter: volume
};
export default adapter;
