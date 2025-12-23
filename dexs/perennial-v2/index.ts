import request, { gql } from 'graphql-request'
import { FetchOptions, SimpleAdapter } from '../../adapters/types'
import { CHAIN } from '../../helpers/chains'
import { getEnv } from '../../helpers/env'

const apiKey = getEnv('PERENNIAL_V2_SUBGRAPH_API_KEY')
const chainConfig: { [chain: string]: { start: string, graphUrl: string, deadFrom?: string } } = {
  [CHAIN.ARBITRUM]: {
    start: '2023-09-29',
    graphUrl: `https://subgraph.satsuma-prod.com/${apiKey}/equilibria/perennial-v2-arbitrum-new/api`,
    deadFrom: '2025-03-02'
  },
  [CHAIN.PERENNIAL]: {
    start: '2025-02-13',
    graphUrl: 'https://api.perennial.foundation/subgraphs/perennial'
  },
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

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const dailyData: IGraphResponse = await request(chainConfig[options.chain].graphUrl, volumeDataQuery, {
    period: String(options.startOfDay),
    periodEnd: String(options.startOfDay + 86400),
  })

  const totalDailyVolume = dailyData.daily.reduce(
    (sum, el) => BigInt(sum) + BigInt(el.longNotional) + BigInt(el.shortNotional),
    BigInt(0)
  ).toString()

  return {
    dailyVolume: (Number(totalDailyVolume) * 10 ** -6).toString(),
  }
}

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  adapter: chainConfig
}

export default adapter
