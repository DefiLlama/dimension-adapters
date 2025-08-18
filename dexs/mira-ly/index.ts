import request from "graphql-request";
import { FetchOptions, SimpleAdapter } from "../../adapters/types"
import { CHAIN } from "../../helpers/chains"
import { httpPost } from "../../utils/fetchURL";

const graphUrl = 'https://mira-dex.squids.live/mira-indexer@v2/api/graphql'

const fetchVolume = async (timestamp: number, _:any, options: FetchOptions) => {
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
    timestamp: timestamp,
  }
}

const adapters: SimpleAdapter = {
  version: 1,
  adapter: {
    [CHAIN.FUEL]: {
      fetch: fetchVolume,
      start: '2020-09-30',
    }
  }
}

export default adapters
