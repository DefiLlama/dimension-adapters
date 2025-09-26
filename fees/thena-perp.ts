import request from "graphql-request";
import { CHAIN } from "../helpers/chains";
import BigNumber from "bignumber.js";
import { FetchOptions, FetchResultFees, SimpleAdapter } from "../adapters/types";

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

const toString = (x: BigNumber) => {
  if (x.isEqualTo(0)) return '0'
  return x.toString()
}

const fetch = async (_:any, _1:any, { fromTimestamp, toTimestamp}: FetchOptions): Promise<FetchResultFees> => {
  const response: IGraphResponse = await request(endpoint, query, {
    from: String(fromTimestamp),
    to: String(toTimestamp)
  })

  if (response.dailyHistories.length !==1) throw new Error("Unexpected dailyHistories length")
  let dailyFees = new BigNumber(0);
  response.dailyHistories.forEach(data => {
    dailyFees = dailyFees.plus(new BigNumber(data.platformFee))
  });

  dailyFees = dailyFees.dividedBy(new BigNumber(1e18))

  const _dailyFees = toString(dailyFees)

  return {
    dailyFees: _dailyFees,
    dailyUserFees: _dailyFees,
    dailyRevenue: _dailyFees,
    dailyProtocolRevenue: '0',
    dailyHoldersRevenue: _dailyFees,
    dailySupplySideRevenue: '0',
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
