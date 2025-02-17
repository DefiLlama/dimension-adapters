import { GraphQLClient, gql } from 'graphql-request'
import { CHAIN } from "../../helpers/chains";

const PIPERX_GRAPHQL_URL = 'https://api.goldsky.com/api/public/project_clzxbl27v2ce101zr2s7sfo05/subgraphs/story-dex-swaps-mainnet/1.0.1/gn'

const graphQLClient = new GraphQLClient(PIPERX_GRAPHQL_URL)

const METRICS_QUERY = gql`
  query getDexMetrics {
    dex(id: "piperx") {
      totalVolumeUSD
    }
  }
`

async function volume(api) {
  const { dex } = await graphQLClient.request(METRICS_QUERY)
  
  // The value has 6 decimal places
  const totalVolumeUSD = Number(dex.totalVolumeUSD) / 1e6
  
  return {
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
