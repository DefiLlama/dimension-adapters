import * as sdk from "@defillama/sdk";
import request, { gql } from "graphql-request";
import { CHAIN } from "../helpers/chains";
import BigNumber from "bignumber.js";
import { getUniqStartOfTodayTimestamp } from "../helpers/getUniSubgraphVolume";
import { FetchOptions, FetchResultFees, SimpleAdapter } from "../adapters/types";

const endpoint = sdk.graph.modifyEndpoint('9rrUvLtMMDLkSQeFdFza8pxea64hEaV3D8hxZYie1jpZ')

const query = gql`
  query stats($from: String!, $to: String!) {
    dailyHistories(where: {timestamp_gte: $from, timestamp_lte: $to, accountSource: "0x5dE6949717F3AA8E0Fbed5Ce8B611Ebcf1e44AE9"}){
      timestamp
      platformFee
      accountSource
      tradeVolume
    }
    totalHistories(where: {accountSource: "0x5dE6949717F3AA8E0Fbed5Ce8B611Ebcf1e44AE9"}) {
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
  if (x.isEqualTo(0)) return '0';
  return x.toString()
}

const fetchVolume = async ({ fromTimestamp, toTimestamp}: FetchOptions) => {
  const response: IGraphResponse = await request(endpoint, query, {
    from: String(fromTimestamp),
    to: String(toTimestamp)
  })


  let dailyFees = new BigNumber(0);
  response.dailyHistories.forEach(data => {
    dailyFees = dailyFees.plus(new BigNumber(data.platformFee))
  });

  let totalFees = new BigNumber(0);
  response.totalHistories.forEach(data => {
    totalFees = totalFees.plus(new BigNumber(data.platformFee))
  });

  dailyFees = dailyFees.dividedBy(new BigNumber(1e18))
  totalFees = totalFees.dividedBy(new BigNumber(1e18))

  const _dailyFees = toString(dailyFees)
  const _totalFees = toString(totalFees)

  const dailyUserFees = _dailyFees;
  const dailyRevenue = _dailyFees;
  const dailyProtocolRevenue = '0';
  const dailyHoldersRevenue = _dailyFees;
  const dailySupplySideRevenue = '0';

  const totalUserFees = _totalFees;
  const totalRevenue = _totalFees;
  const totalProtocolRevenue = '0';
  const totalSupplySideRevenue = '0';

  return {
    dailyFees: _dailyFees,
    totalFees: _totalFees,

    dailyUserFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailyHoldersRevenue,
    dailySupplySideRevenue,
    totalUserFees,
    totalRevenue,
    totalProtocolRevenue,
    totalSupplySideRevenue,
  }

}


const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.BASE]: {
      fetch: fetchVolume,
      start: '2023-08-06'
    }
  },
  deadFrom: '2025-02-01',
}
export default adapter;
