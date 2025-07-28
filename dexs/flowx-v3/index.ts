import { GraphQLClient } from "graphql-request"
import { FetchOptions, SimpleAdapter } from "../../adapters/types"
import { CHAIN } from "../../helpers/chains"

const getDailyVolume = (startTime: number, endTime: number) => `{
  getClmmVolume(endTime: ${endTime}, startTime: ${startTime})
}`


const fetch = async ({ fromTimestamp, toTimestamp, }: FetchOptions) => {
  const graphQLClient = new GraphQLClient("https://api.flowx.finance/flowx-be/graphql")
  const statsRes = await graphQLClient.request(getDailyVolume((fromTimestamp) * 1000, toTimestamp * 1000))

  return { dailyVolume: statsRes.getClmmVolume }
}

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.SUI]: {
      fetch: fetch,
      start: "2024-05-10",
    },
  },
}

export default adapter
