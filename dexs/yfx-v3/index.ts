import request, { gql } from "graphql-request";
import { SimpleAdapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const KEY = '1079471f4ef05e4e9637de21d4bb7c6a'

const endpoints: { [key: string]: string } = {
  [CHAIN.ARBITRUM]: "https://gateway-arbitrum.network.thegraph.com/api/" + KEY + "/subgraphs/id/wTKJtDwtthHZDpp79HbHuegwJRqisjevFDsRtAiSShe"
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


const fetch = async (options: FetchOptions) => {
  const dailyData: IGraphResponse = await request(endpoints[options.chain], historicalDailyData, {
    dayTime: String(options.startOfDay),
  })
  let dailyVolume = 0;
  for (let i in dailyData.marketInfoDailies) {
    dailyVolume += parseFloat(dailyData.marketInfoDailies[i].totalVol)
  }

  return {
    dailyVolume,
  }
}
const startTimestamps: { [chain: string]: number } = {
  [CHAIN.ARBITRUM]: 1691128800,
}

const adapter: SimpleAdapter = {
  fetch,
  chains: [CHAIN.ARBITRUM],
  start: startTimestamps[CHAIN.ARBITRUM],
};
export default adapter;
