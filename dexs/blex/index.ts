import request, { gql } from "graphql-request";
import { BreakdownAdapter, Fetch, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";

const endpoints: { [key: string]: string } = {
    [CHAIN.ARBITRUM]: "https://api.thegraph.com/subgraphs/name/blex-dex/arbitrum_42161",
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
    const totalData: IGraphResponse = await request(endpoints[chain], query, {
      id: 'total',
      period: 'total',
    })

    return {
      timestamp: dayTimestamp,
      dailyVolume:
        dailyData.summaries.length == 1
          ? String(Number(Object.values(dailyData.summaries[0]).reduce((sum, element) => String(Number(sum) + Number(element)))) * 10  ** -18)
          : undefined,
      totalVolume:
        totalData.summaries.length == 1
          ? String(Number(Object.values(totalData.summaries[0]).reduce((sum, element) => String(Number(sum) + Number(element)))) * 10 ** -18)
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
