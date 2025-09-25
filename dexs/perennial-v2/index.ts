import request, { gql } from 'graphql-request'
import { Fetch, SimpleAdapter } from '../../adapters/types'
import { CHAIN } from '../../helpers/chains'
import { getUniqStartOfTodayTimestamp } from '../../helpers/getUniSubgraphVolume'
import { getEnv } from '../../helpers/env'

const apiKey = getEnv('PERENNIAL_V2_SUBGRAPH_API_KEY')
const graphUrls: { [key: string]: string } = {
  [CHAIN.ARBITRUM]: `https://subgraph.satsuma-prod.com/${apiKey}/equilibria/perennial-v2-arbitrum-new/api`,
  [CHAIN.PERENNIAL]: 'https://api.perennial.foundation/subgraphs/perennial',
}

const volumeDataQuery = gql`
  query PNLVolume($period: BigInt!, $periodEnd: BigInt!) {
    daily: protocolAccumulations(
      where: { bucket: daily, timestamp_gte: $period, timestamp_lt: $periodEnd }
      first: 1000
      orderBy: timestamp
      orderDirection: desc
    ) {
      longNotional
      shortNotional
    }
    total: protocolAccumulations(where: { bucket: all }) {
      longNotional
      shortNotional
    }
  }
`

interface IGraphResponse {
  daily: Array<{
    market: string
    longNotional: string
    shortNotional: string
  }>

  total: Array<{
    market: string
    longNotional: string
    shortNotional: string
  }>
}

const getFetch =
  (query: string) =>
    (chain: string): Fetch =>
      async (timestamp: number) => {
        const dayTimestamp = getUniqStartOfTodayTimestamp(
          new Date(timestamp * 1000)
        )
        const endTimestamp = dayTimestamp + 86400

        const volumeData: IGraphResponse = await request(graphUrls[chain], query, {
          period: dayTimestamp.toString(),
          periodEnd: endTimestamp.toString(),
        })

        const totalDailyVolume = volumeData.daily.reduce(
          (sum, el) =>
            (
              BigInt(sum) +
              BigInt(el.longNotional) +
              BigInt(el.shortNotional)
            ).toString(),
          '0'
        )
        return {
          timestamp: dayTimestamp,
          dailyVolume: (Number(totalDailyVolume) * 10 ** -6).toString(),
        }
      }

const startTimestamps: { [chain: string]: number } = {
  [CHAIN.ARBITRUM]: 1695945600,
  [CHAIN.PERENNIAL]: 1739482625,
}

const adapter: SimpleAdapter = {
  adapter: Object.keys(graphUrls).reduce((acc, chain) => {
    return {
      ...acc,
      [chain]: {
        fetch: getFetch(volumeDataQuery)(chain),
        start: startTimestamps[chain],
      },
    }
  }, {}),
}

export default adapter
