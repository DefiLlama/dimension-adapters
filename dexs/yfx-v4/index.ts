import request, { gql } from "graphql-request";
import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

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


const getFetch = (chain: string) => async (_t: any, _b: any, { startOfDay }: any) => {
  const dailyData: IGraphResponse = await request(endpoints[chain], historicalDailyData, {
    dayTime: String(startOfDay),
  })

  let dailyVolume = 0;
  for(let i in dailyData.marketInfoDailies) {
    dailyVolume += parseFloat(dailyData.marketInfoDailies[i].totalVolUSD)
  }

  return {
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
  version: 1,
  adapter: volume
};
export default adapter;
