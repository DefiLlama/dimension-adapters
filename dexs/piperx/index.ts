import { GraphQLClient, gql } from 'graphql-request'
import { CHAIN } from "../../helpers/chains";

const PIPERX_GRAPHQL_URL = 'https://api.goldsky.com/api/public/project_clzxbl27v2ce101zr2s7sfo05/subgraphs/story-dex-swaps-mainnet/1.0.3/gn'

const graphQLClient = new GraphQLClient(PIPERX_GRAPHQL_URL)

const METRICS_QUERY = gql`
  query getDexMetrics {
    dex(id: "piperx") {
      totalVolumeUSD
    }
  }
`
const DAILY_VOLUME_QUERY = gql`
  query {
        totalVolumeAggregates(
          interval: "day"
        ) {
          timestamp
          volumeUSD
          volumeNative
        }
  }
`
async function volume(api) {
  const { dex } = await graphQLClient.request(METRICS_QUERY)
  const { totalVolumeAggregates } = await graphQLClient.request(DAILY_VOLUME_QUERY)
  // The value has 6 decimal places
  const totalVolumeUSD = Number(dex.totalVolumeUSD) / 1e6
  const dailyVolumeUSD = totalVolumeAggregates[0].volumeUSD / 1e6
  return {
    dailyVolume: dailyVolumeUSD,
    totalVolume: totalVolumeUSD
  }
}

export default {
  version: 2,
  adapter: {
    [CHAIN.STORY]: {
      fetch: volume,
      start: '2025-02-12',
    },
  },
}
