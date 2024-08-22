import request, { gql } from "graphql-request";
import { BreakdownAdapter, Fetch, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";

const endpoints: { [key: string]: string } = {
  [CHAIN.ARBITRUM]: "https://subgraph.satsuma-prod.com/3b2ced13c8d9/gmx/synthetics-arbitrum-stats/api",
  [CHAIN.AVAX]: "https://subgraph.satsuma-prod.com/3b2ced13c8d9/gmx/synthetics-avalanche-stats/api",
}

const historicalDataSwap = gql`
  query get_volume($period: String!, $id: String!) {
    volumeInfos(where: {period: $period, id: $id}) {
        swapVolumeUsd
      }
  }
`

const historicalDataDerivatives = gql`
  query get_volume($period: String!, $id: String!) {
    volumeInfos(where: {period: $period, id: $id}) {
        marginVolumeUsd
      }
  }
`

interface IGraphResponse {
  volumeInfos: Array<{
    marginVolumeUsd: string,
    swapVolumeUsd: string,
  }>
}

const getFetch = (query: string)=> (chain: string): Fetch => async (timestamp: number) => {
  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date((timestamp * 1000)))
  const dailyData: IGraphResponse = await request(endpoints[chain], query, {
    id: '1d:' + chain === CHAIN.ARBITRUM
      ? String(dayTimestamp)
      : String(dayTimestamp),
    period: '1d',
  })
  const totalData: IGraphResponse = await request(endpoints[chain], query, {
    id: 'total',
    period: 'total',
  })

  return {
    timestamp: dayTimestamp,
    dailyVolume:
      dailyData.volumeInfos.length == 1
        ? String(Number(Object.values(dailyData.volumeInfos[0]).reduce((sum, element) => String(Number(sum) + Number(element)))) * 10 ** -30)
        : undefined,
    totalVolume:
      totalData.volumeInfos.length == 1
        ? String(Number(Object.values(totalData.volumeInfos[0]).reduce((sum, element) => String(Number(sum) + Number(element)))) * 10 ** -30)
        : undefined,
  }
}

const startTimestamps: { [chain: string]: number } = {
  [CHAIN.ARBITRUM]: 1630368000,
  [CHAIN.AVAX]: 1640131200,
}

const methodology = {
  dailyVolume:
    "Sum of daily total volume for all markets on a given day.",
  totalVolume:
    "Sum of overall total volume for all markets since inception."
}

const adapter: BreakdownAdapter = {
  breakdown: {
    "gmx-v2-swap": Object.keys(endpoints).reduce((acc, chain) => {
      return {
        ...acc,
        [chain]: {
          fetch: getFetch(historicalDataSwap)(chain),
          start: startTimestamps[chain],
          meta: {methodology}
        }
      }
    }, {}),
    "gmx-v2-trade": Object.keys(endpoints).reduce((acc, chain) => {
      return {
        ...acc,
        [chain]: {
          fetch: getFetch(historicalDataDerivatives)(chain),
          start: startTimestamps[chain],
          meta: {methodology}
        }
      }
    }, {})
  }
}

export default adapter;
