import request from "graphql-request";
import { FetchOptions, FetchResultVolume, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";


const endpoint = 'https://api.goldsky.com/api/public/project_cm1hfr4527p0f01u85mz499u8/subgraphs/bnb_analytics/latest/gn'

const query = `
  query stats($from: String!, $to: String!) {
    dailyHistories(where: {timestamp_gte: $from, timestamp_lte: $to, accountSource: "0x650a2d6c263a93cff5edd41f836ce832f05a1cf3"}){
      timestamp
      platformFee
      accountSource
      tradeVolume
    }
  }
`
interface IGraphResponse {
  dailyHistories: Array<{
    tiemstamp: string,
    platformFee: string,
    accountSource: string,
    tradeVolume: string
  }>
}

const fetchVolume = async (_: any, _1: any, { fromTimestamp, toTimestamp }: FetchOptions): Promise<FetchResultVolume> => {
  const response: IGraphResponse = await request(endpoint, query, {
    from: String(fromTimestamp),
    to: String(toTimestamp)
  })

  if (response.dailyHistories.length !== 1) throw new Error("Unexpected dailyHistories length")

  return {
    dailyVolume: response.dailyHistories[0].tradeVolume / 1e18,
  }
}

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.BSC]: {
      fetch: fetchVolume,
      start: '2023-12-18'
    }
  }
}

export default adapter;
