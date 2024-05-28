import request, { gql } from "graphql-request";
import { Fetch, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";

const chains = [CHAIN.ARBITRUM]

const endpoints: { [key: string]: string } = {
  [CHAIN.ARBITRUM]: "https://graph-v4.yfx.com/yfx_v4"
}

const historicalDailyData = gql`
  query marketInfoDailies($dayTime: String!){
    marketInfoDailies(where: {dayTime: $dayTime}) {
      liqVolUSD
      totalVolUSD
    }
  }
`
const historicalTotalData = gql`
  query markets {
    markets {
      # liqVol
      totalVolUSD
    }
  }
`

interface IGraphResponse {
  marketInfoDailies: Array<{
    liqVolUSD: string,
    totalVolUSD: string,
  }>
}
interface IGraphResponse {
  markets: Array<{
    liqVolUSD: string,
    totalVolUSD: string,
  }>
}


const getFetch = (chain: string): Fetch => async (timestamp: any) => {
  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date((timestamp.toTimestamp * 1000)))
  
  const dailyData: IGraphResponse = await request(endpoints[chain], historicalDailyData, {
    dayTime: String(dayTimestamp),
  })
  
  let dailyVolume = 0;
  for(let i in dailyData.marketInfoDailies) {
    dailyVolume += parseFloat(dailyData.marketInfoDailies[i].totalVolUSD)
  }
  
  const totalData: IGraphResponse = await request(endpoints[chain], historicalTotalData, {})
  let totalVolume = 0;
  for(let i in totalData.markets) {
    totalVolume += parseFloat(totalData.markets[i].totalVolUSD)
  }
  
  return {
    timestamp: dayTimestamp,
    dailyVolume: dailyVolume.toString(),
    totalVolume: totalVolume.toString()
  }
}

const getStartTimestamp = async (chain: string) => {
  const startTimestamps: { [chain: string]: number } = {
    [CHAIN.ARBITRUM]: 1713916800,
  }
  return startTimestamps[chain]
}


const volume = chains.reduce(
  (acc, chain) => ({
    ...acc,
    [chain]: {
      fetch: getFetch(chain),
      start: async () => getStartTimestamp(chain)
    },
  }),
  {}
);

const adapter: SimpleAdapter = {
  version: 2,
  adapter: volume
};
export default adapter;
