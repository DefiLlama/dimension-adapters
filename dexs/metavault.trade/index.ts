import request, { gql } from "graphql-request";
import { BreakdownAdapter, Fetch, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";

const endpoints: { [key: string]: string } = {
  [CHAIN.POLYGON]: "https://api.thegraph.com/subgraphs/name/sdcrypt0/metavault-mvx-subgraph",
}

const historicalData = gql`
  query get_volume($period: String!, $id: String!) {
    volumeStats(where: {period: $period, id: $id}) {
        swap
      }
  }
`

const derivativesVolume = gql`
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

const getFetch = (chain: string, query: string): Fetch => async (timestamp: number) => {
  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date((timestamp * 1000)))
  const dailyData: IGraphResponse = await request(endpoints[chain], query, {
    id: String(dayTimestamp) + ':daily',
    period: 'daily',
  })
  const totalData: IGraphResponse = await request(endpoints[chain], query, {
    id: 'total',
    period: 'total',
  })

  return {
    timestamp: dayTimestamp,
    dailyVolume:
      dailyData.volumeStats.length == 1
        ? String(Number(Object.values(dailyData.volumeStats[0]).reduce((sum, element) => String(Number(sum) + Number(element)))) * 10 ** -30)
        : undefined,
    totalVolume:
      totalData.volumeStats.length == 1
        ? String(Number(Object.values(totalData.volumeStats[0]).reduce((sum, element) => String(Number(sum) + Number(element)))) * 10 ** -30)
        : undefined,

  }
}

const startTimestamps: { [chain: string]: number } = {
  [CHAIN.POLYGON]: 1654041600,
}

const adapter: BreakdownAdapter = {
  breakdown: {
    "metavault.trade": {
      [CHAIN.POLYGON]: {
        fetch: getFetch(CHAIN.POLYGON, historicalData),
        start: startTimestamps[CHAIN.POLYGON],
      },
    },
    "metavault-derivative": {
      [CHAIN.POLYGON]: {
        fetch: getFetch(CHAIN.POLYGON, derivativesVolume),
        start: startTimestamps[CHAIN.POLYGON],
      },
    },
  }
}
export default adapter;
