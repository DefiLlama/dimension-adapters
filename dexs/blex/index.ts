import * as sdk from "@defillama/sdk";
import request, { gql } from "graphql-request";
import { BreakdownAdapter, Fetch } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";

const endpoints: { [key: string]: string } = {
    [CHAIN.ARBITRUM]: sdk.graph.modifyEndpoint('FZz1rRe9kEd3FG6ZiX2tdoryxYiSFH4RnzKjMwny3mFH'),
}

const allData=gql`
    query get_summary($period: String!, $id: String!){
        summaries(where: {period: $period, id: $id}){
            tradingLPVolume
        }
    }
`
const derivativesData=gql`
   query get_summary($period: String!, $id: String!){
        summaries(where: {period: $period, id: $id}){
            tradingVolume
        }
    }
`

interface IGraphResponse {
    summaries: Array<{
        tradingVolume: string
        tradingLPVolume: string
        trades: string
        openInterest: string
        uniqueUsers: string
        fees: string
        lpVolume: string
    }>
  }

  const getFetch = (query: string)=> (chain: string): Fetch => async (timestamp: number) => {
    const dayTimestamp = getUniqStartOfTodayTimestamp(new Date((timestamp * 1000)))
    const dailyData: IGraphResponse = await request(endpoints[chain], query, {
      id:  "daily:"+ String(dayTimestamp),
      period: 'daily',
    })

    return {
      dailyVolume:
        dailyData.summaries.length == 1
          ? String(Number(Object.values(dailyData.summaries[0]).reduce((sum, element) => String(Number(sum) + Number(element)))) * 10  ** -18)
          : undefined,
    }
  }

  const startTimestamps: { [chain: string]: number } = {
    [CHAIN.ARBITRUM]: 1691211277,
  }

  const adapter: BreakdownAdapter = {
    breakdown: {
      "volume": Object.keys(endpoints).reduce((acc, chain) => {
        return {
          ...acc,
          [chain]: {
            fetch: getFetch(allData)(chain),
            start: startTimestamps[chain]
          }
        }
      }, {}),
      "derivatives": Object.keys(endpoints).reduce((acc, chain) => {
        return {
          ...acc,
          [chain]: {
            fetch: getFetch(derivativesData)(chain),
            start: startTimestamps[chain]
          }
        }
      }, {})
    }
  }
  export default adapter;
