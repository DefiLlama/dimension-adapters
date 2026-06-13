import request, { gql } from "graphql-request";
import { SimpleAdapter, FetchOptions } from "../../adapters/types";
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


const fetch = async (options: FetchOptions) => {
  const dailyData: IGraphResponse = await request(endpoints[options.chain], historicalDailyData, {
    dayTime: String(options.startOfDay),
  })

  let dailyVolume = 0;
  for (let i in dailyData.marketInfoDailies) {
    dailyVolume += parseFloat(dailyData.marketInfoDailies[i].totalVolUSD)
  }

  return {
    dailyVolume,
  }
}

const startTimestamps: { [chain: string]: number } = {
  [CHAIN.ARBITRUM]: 1713916800,
  [CHAIN.BASE]: 1721001600,
}

const chainsConfig: { [chain: string]: { start: number } } = chains.reduce((acc, chain) => ({
  ...acc,
  [chain]: {
    start: startTimestamps[chain],
  },
}), {})

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  adapter: chainsConfig,
};
export default adapter;
