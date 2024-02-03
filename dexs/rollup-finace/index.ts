import request, { gql } from "graphql-request";
import { BreakdownAdapter, Fetch, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";

const endpoints: { [key: string]: string } = {
  [CHAIN.ERA]: "https://subgraph.rollup.finance/subgraphs/name/rollUp/stats",
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
  const fromTimestamp = dayTimestamp - 60 * 60 * 24
  const dailyData: IGraphResponse = await request(endpoints[chain], query, {
    id: String(dayTimestamp),
    period: 'daily',
  })
  const yesterDay: IGraphResponse = await request(endpoints[chain], query, {
    id: String(fromTimestamp),
    period: 'daily',
  })
  const totalData: IGraphResponse = await request(endpoints[chain], query, {
    id: 'total',
    period: 'total',
  })

  const  todayVolume = Number(Object.values(dailyData.volumeStats[0]).reduce((sum, element) => String(Number(sum) + Number(element)))) * 10 ** -30
  const  yesterdayVolume = Number(Object.values(yesterDay.volumeStats[0]).reduce((sum, element) => String(Number(sum) + Number(element)))) * 10 ** -30
  const dailyVolume = (todayVolume - yesterdayVolume);
  return {
    timestamp: dayTimestamp,
    dailyVolume: `${dailyVolume}`,
    totalVolume:
      totalData.volumeStats.length == 1
        ? String(Number(Object.values(totalData.volumeStats[0]).reduce((sum, element) => String(Number(sum) + Number(element)))) * 10 ** -30)
        : undefined,

  }
}

const startTimestamps: { [chain: string]: number } = {
  [CHAIN.ERA]: 1682035200,
}
const adapter: BreakdownAdapter = {
  breakdown: {
    // "swap": Object.keys(endpoints).reduce((acc, chain) => {
    //   return {
    //     ...acc,
    //     [chain]: {
    //       fetch: getFetch(historicalDataSwap)(chain),
    //       start: startTimestamps[chain]
    //     }
    //   }
    // }, {}),
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
