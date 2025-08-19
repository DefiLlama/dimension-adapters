import * as sdk from "@defillama/sdk";
import request, { gql } from "graphql-request";
import { FetchResultVolume, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import BigNumber from "bignumber.js";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";

const ONE_DAY_IN_SECONDS = 60 * 60 * 24

const endpoint = sdk.graph.modifyEndpoint('DYHqLcjXMBC9c7AGvrYSBfQ6fQS723PJHF2usA9JX8NN')

const query = gql`
  query stats($from: String!, $to: String!) {
    dailyHistories(where: {timestamp_gte: $from, timestamp_lte: $to, accountSource: "0x650a2d6c263a93cff5edd41f836ce832f05a1cf3"}){
      timestamp
      platformFee
      accountSource
      tradeVolume
    }
    totalHistories(where: {accountSource: "0x650a2d6c263a93cff5edd41f836ce832f05a1cf3"}) {
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
  totalHistories: Array<{
    tiemstamp: string,
    platformFee: string,
    accountSource: string,
    tradeVolume: BigNumber
  }>
}

const toString = (x: BigNumber) => {
  if (x.isEqualTo(0)) return undefined
  return x.toString()
}

const fetchVolume = async (timestamp: number): Promise<FetchResultVolume> => {
  const response: IGraphResponse = await request(endpoint, query, {
    from: String(timestamp - ONE_DAY_IN_SECONDS),
    to: String(timestamp)
  })


  let dailyVolume = new BigNumber(0);
  response.dailyHistories.forEach(data => {
    dailyVolume = dailyVolume.plus(new BigNumber(data.tradeVolume))
  });

  dailyVolume = dailyVolume.dividedBy(new BigNumber(1e18))

  const _dailyVolume = toString(dailyVolume)

  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date((timestamp * 1000)))

  return {
    timestamp: dayTimestamp,
    dailyVolume: _dailyVolume,
  }

}

const adapter: SimpleAdapter = {
  deadFrom: '2024-09-01',
  adapter: {
    [CHAIN.BSC]: {
      fetch: fetchVolume,
      start: '2023-12-18'
    }
  }
}

export default adapter;
