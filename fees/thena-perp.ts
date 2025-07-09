import * as sdk from "@defillama/sdk";
import request, { gql } from "graphql-request";
import { CHAIN } from "../helpers/chains";
import BigNumber from "bignumber.js";
import { FetchResultFees, SimpleAdapter } from "../adapters/types";

const ONE_DAY_IN_SECONDS = 60 * 60 * 24

const endpoint = sdk.graph.modifyEndpoint('79T7bT3tnBWmFPukyDdEY4mqHWrYTaJtzgoz6ufzC9xN')

const query = gql`
  query stats($from: String!, $to: String!) {
    dailyHistories(where: {timestamp_gte: $from, timestamp_lte: $to, accountSource: "0x75c539eFB5300234e5DaA684502735Fc3886e8b4"}){
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

const fetch = async (timestamp: number): Promise<FetchResultFees> => {
  const response: IGraphResponse = await request(endpoint, query, {
    from: String(timestamp - ONE_DAY_IN_SECONDS),
    to: String(timestamp)
  })

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
  deadFrom: '2024-09-01',
  adapter: {
    [CHAIN.BSC]: {
      fetch,
      start: '2023-06-27'
    }
  }
}
export default adapter;
