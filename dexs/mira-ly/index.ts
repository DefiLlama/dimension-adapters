import request from "graphql-request";
import { FetchOptions, SimpleAdapter } from "../../adapters/types"
import { CHAIN } from "../../helpers/chains"

const graphUrl = 'https://mira-dex.squids.live/mira-indexer@v3/api/graphql'

const fetch = async (options: FetchOptions) => {
  const start = options.startOfDay;
  const end = start + 86400;
  const query = `
  {
    poolsConnection(orderBy: id_ASC) {
      edges {
        node {
          snapshots(where:{timestamp_gte:${start}, timestamp_lte:${end}}) {
            timestamp
            volumeUSD
          }
        }
      }
    }
  }`
  const response = (await request(graphUrl, query))
  const res = response.poolsConnection.edges.map((i: any) => i.node.snapshots.map((j: any) => j.volumeUSD)).flat()
  const dailyVolume = res.reduce((acc: number, i: number) => acc + i, 0)
  return {
    dailyVolume: dailyVolume,
  }
}

const adapters: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.FUEL],
  start: '2024-10-16',
}

export default adapters
