import request, { gql } from "graphql-request";
import { Fetch, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";

const chains = [CHAIN.ARBITRUM]
const KEY = '1079471f4ef05e4e9637de21d4bb7c6a'

const endpoints: { [key: string]: string } = {
  [CHAIN.ARBITRUM]: "https://gateway-arbitrum.network.thegraph.com/api/"+KEY+"/subgraphs/id/wTKJtDwtthHZDpp79HbHuegwJRqisjevFDsRtAiSShe"
}

const historicalDailyData = gql`
  query marketInfoDailies($dayTime: String!){
    marketInfoDailies(where: {dayTime: $dayTime}) {
      liqVol
      totalVol
    }
  }
`

interface IGraphResponse {
  marketInfoDailies: Array<{
    liqVol: string,
    totalVol: string,
  }>
}
interface IGraphResponse {
  markets: Array<{
    liqVol: string,
    totalVol: string,
  }>
}


const getFetch = (chain: string): Fetch => async (timestamp: number) => {
  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date((timestamp * 1000)))
  
  const dailyData: IGraphResponse = await request(endpoints[chain], historicalDailyData, {
    dayTime: String(dayTimestamp),
  })
  let dailyVolume = 0;
  for(let i in dailyData.marketInfoDailies) {
    dailyVolume += parseFloat(dailyData.marketInfoDailies[i].totalVol)
  }
  
  return {
    timestamp: dayTimestamp,
    dailyVolume: dailyVolume.toString(),
  }
}

const startTimestamps: { [chain: string]: number } = {
  [CHAIN.ARBITRUM]: 1691128800,
}

const volume = chains.reduce(
  (acc, chain) => ({
    ...acc,
    [chain]: {
      fetch: getFetch(chain),
      start: startTimestamps[chain]
    },
  }),
  {}
);

const adapter: SimpleAdapter = {
  adapter: volume
};
export default adapter;
