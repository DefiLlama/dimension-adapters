import * as sdk from "@defillama/sdk";
import request, { gql } from "graphql-request";
import { BreakdownAdapter, Fetch, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";

const endpoints: { [key: string]: string } = {
  [CHAIN.ARBITRUM]: sdk.graph.modifyEndpoint('9ob9R8ufkfEXnqp1s3izXjwQgXEnkSi9KXazYC9LdBC4'),
  [CHAIN.BSC]: sdk.graph.modifyEndpoint('EMyH7BU8sp2sBCAtfDCqfnXyiKDUf3NbPpU6bg6vdAaH'),
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
    id: String(dayTimestamp) + ':daily',
    period: 'daily',
  })
  return {
    timestamp: dayTimestamp,
    dailyVolume:
      dailyData.volumeStats.length == 1
        ? String(Number(Object.values(dailyData.volumeStats[0]).reduce((sum, element) => String(Number(sum) + Number(element)))) * 10 ** -30)
        : '0',
  }
}

const startTimestamps: { [chain: string]: number } = {
  [CHAIN.ARBITRUM]: 1680480000,
  [CHAIN.BSC]: 1678406400,
}

const adapter: BreakdownAdapter = {
  breakdown: {
    "swap": Object.keys(endpoints).reduce((acc, chain) => {
      return {
        ...acc,
        [chain]: {
          fetch: getFetch(historicalDataSwap)(chain),
          start: startTimestamps[chain]
        }
      }
    }, {}),
    "derivatives": Object.keys(endpoints).reduce((acc, chain) => {
      return {
        ...acc,
        [chain]: {
          fetch: getFetch(historicalDataDerivatives)(chain),
          start: startTimestamps[chain]
        }
      }
    }, {})
  }
}

export default adapter;
