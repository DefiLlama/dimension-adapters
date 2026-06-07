import * as sdk from "@defillama/sdk";
import request, { gql } from "graphql-request";
import { SimpleAdapter, FetchOptions, FetchV2 } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const endpoints: { [key: string]: string } = {
  [CHAIN.ARBITRUM]: sdk.graph.modifyEndpoint('FZz1rRe9kEd3FG6ZiX2tdoryxYiSFH4RnzKjMwny3mFH'),
}

const derivativesData = gql`
  query get_summary($period: String!, $id: String!){
    summaries(where: {period: $period, id: $id}){
      tradingVolume
    }
  }
`

interface IGraphResponse {
  summaries: Array<{
    tradingVolume: string
    tradingLPVolume: string
    trades: string
    openInterest: string
    uniqueUsers: string
    fees: string
    lpVolume: string
  }>
}

const fetch = async (options: FetchOptions) => {
  const chain = options.chain;
  const dailyData: IGraphResponse = await request(endpoints[chain], derivativesData, {
    id: "daily:" + String(options.startOfDay),
    period: 'daily',
  })

  return {
    dailyVolume:
      dailyData.summaries.length == 1
        ? String(Number(Object.values(dailyData.summaries[0]).reduce((sum, element) => String(Number(sum) + Number(element)))) * 10 ** -18)
        : undefined,
  }
}

const startTimestamps: { [chain: string]: number } = {
  [CHAIN.ARBITRUM]: 1691211277,
}

const adapter: SimpleAdapter = {
  fetch,
  chains: [CHAIN.ARBITRUM],
  start: startTimestamps[CHAIN.ARBITRUM],
  deadFrom: "2025-03-15",
}

export default adapter;
