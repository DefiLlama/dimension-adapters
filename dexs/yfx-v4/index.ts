import request, { gql } from "graphql-request";
import { Fetch, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";

const chains = [CHAIN.ARBITRUM, CHAIN.BASE]

const endpoints: { [key: string]: string } = {
  [CHAIN.ARBITRUM]: "https://graph-v4.yfx.com/yfx_v4",
  [CHAIN.BASE]: "https://graph-v4.yfx.com/yfx_v4_base",
}

const historicalDailyData = gql`
  query marketInfoDailies($dayTime: String!){
    marketInfoDailies(where: {dayTime: $dayTime}) {
      liqVolUSD
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
  
  return {
    timestamp: dayTimestamp,
    dailyVolume: dailyVolume.toString(),
  }
}

const getStartTimestamp = (chain: string) => {
  const startTimestamps: { [chain: string]: number } = {
    [CHAIN.ARBITRUM]: 1713916800,
    [CHAIN.BASE]: 1721001600,
  }
  return startTimestamps[chain]
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
  version: 2,
  adapter: volume
};
export default adapter;
