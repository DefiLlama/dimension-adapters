import * as sdk from "@defillama/sdk";
import request, { gql } from "graphql-request";
import { BreakdownAdapter, Fetch } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";

const endpoints: { [key: string]: string } = {
  // [CHAIN.BSC]: sdk.graph.modifyEndpoint('FiegiatdkorjPCvK72UyHvmJHvWtS3oQS6zwnR94Xe7c'),
  [CHAIN.ARBITRUM]: sdk.graph.modifyEndpoint('G3wquxtaw68uX5GAZ7XBPWK8Fa7Buf66Y27uT8erqQZ4'),
}

const historicalDataSwap = gql`
  query get_volume($period: String!, $id: String!) {
    volumeStats(where: {period: $period, id: $id}) {
        swap
      }
  }
`
const historicalDataDerivatives = gql`
  query get_volume($period: String!, $id: String!) {
    volumeStats(where: {period: $period, id: $id}) {
      liquidation
      margin
    }
  }
`

interface IGraphResponse {
  volumeStats: Array<{
    burn: string,
    liquidation: string,
    margin: string,
    mint: string,
    swap: string,
  }>
}

const getFetch = (query: string)=> (chain: string): Fetch => async (timestamp: number) => {
  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date((timestamp * 1000)))
  const dailyData: IGraphResponse = await request(endpoints[chain], query, {
    id: String(dayTimestamp),
    period: 'daily',
  })

  return {
    dailyVolume:
      dailyData.volumeStats.length == 1
        ? String(Number(Object.values(dailyData.volumeStats[0]).reduce((sum, element) => String(Number(sum) + Number(element)))) * 10 ** -30)
        : undefined,
  }
}

const startTimestamps: { [chain: string]: number } = {
  [CHAIN.BSC]: 1670198400,
  [CHAIN.ARBITRUM]: 1678118400,
}
//
// const adapter: SimpleAdapter = {
//   adapter: {
//     [CHAIN.BSC]: {
//       fetch: getFetch(historicalDataSwap)(CHAIN.BSC),
//       start: async () => getStartTimestamp(CHAIN.BSC),
//     },
//     [CHAIN.ARBITRUM]: {
//       fetch: getFetch(historicalDataSwap)(CHAIN.ARBITRUM),
//       start: async () => getStartTimestamp(CHAIN.ARBITRUM),
//     }
//   },
// };


const adapter: BreakdownAdapter = {
  deadFrom: '2024-02-21',
  breakdown: {

    "swap": Object.keys(endpoints).reduce((acc, chain) => {
      return {
        ...acc,
        [chain]: {
          fetch: async (timestamp: number) => {return {timestamp}},
          start: startTimestamps[chain]
        }
      }
    }, {}),
    "derivatives": Object.keys(endpoints).reduce((acc, chain) => {
      return {
        ...acc,
        [chain]: {
          fetch:  async (timestamp: number) => {return {timestamp}},
          start: startTimestamps[chain]
        }
      }
    }, {})
  }
}

export default adapter;
