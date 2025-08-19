import { GraphQLClient, gql } from 'graphql-request'
import { CHAIN } from "../../helpers/chains";
import { FetchOptions } from "../../adapters/types";

const PIPERX_GRAPHQL_URL = 'https://api.goldsky.com/api/public/project_clzxbl27v2ce101zr2s7sfo05/subgraphs/story-dex-swaps-mainnet/prod/gn'

const graphQLClient = new GraphQLClient(PIPERX_GRAPHQL_URL)

const METRICS_QUERY = gql`
  query getDexMetrics {
    dex(id: "piperx") {
      totalVolumeV3USD
    }
  }
`
const DAILY_VOLUME_QUERY = (dayID: string) => gql`
  query {
        dexvolume(id: "${dayID}") {
          totalVolumeV3USD
        }
  }
`
async function volume(options: FetchOptions) {
  const dayID = Math.floor(options.endTimestamp / 86400).toString();
  const dayIDLastDay = Math.floor(options.startTimestamp / 86400).toString();

  const { dexvolume: dexvolumes } = await graphQLClient.request(DAILY_VOLUME_QUERY(dayID))
  const { dexvolume: dexvolumesLastDay } = await graphQLClient.request(DAILY_VOLUME_QUERY(dayIDLastDay))
  // The value has 6 decimal places
  const dailyVolumeUSD = (Number(dexvolumes.totalVolumeV3USD) / 1e6) - (Number(dexvolumesLastDay.totalVolumeV3USD) / 1e6)
  return {
    dailyVolume: dailyVolumeUSD,
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
