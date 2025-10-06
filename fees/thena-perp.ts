import request from "graphql-request";
import { CHAIN } from "../helpers/chains";
import { FetchOptions, SimpleAdapter } from "../adapters/types";

const endpoint = 'https://api.goldsky.com/api/public/project_cm1hfr4527p0f01u85mz499u8/subgraphs/bnb_analytics/latest/gn'

const query = `
  query stats($from: String!, $to: String!) {
    dailyHistories(where: {timestamp_gte: $from, timestamp_lte: $to, accountSource: "0x650a2d6c263a93cff5edd41f836ce832f05a1cf3"}){
      timestamp
      platformFee
      accountSource
      tradeVolume
      openInterest
    }
  }
`

const fetch = async (_: any, _1: any, { fromTimestamp, toTimestamp }: FetchOptions) => {
  const response: any = await request(endpoint, query, { from: String(fromTimestamp), to: String(toTimestamp) })

  if (response.dailyHistories.length !== 1) throw new Error("Unexpected dailyHistories length")
  let { dailyHistories: [{ platformFee: dailyFees, tradeVolume: dailyVolume, openInterest: openInterestAtEnd }] } = response
  dailyFees /= 1e18
  dailyVolume /= 1e18
  openInterestAtEnd /= 1e18

  return {
    dailyFees: dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: 0,
    dailyHoldersRevenue: dailyFees,
    dailySupplySideRevenue: 0,
    dailyVolume,
    openInterestAtEnd,
  }
}


const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.BSC]: {
      fetch,
      start: '2023-06-27'
    }
  }
}
export default adapter;
