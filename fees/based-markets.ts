import request, { gql } from "graphql-request";
import { CHAIN } from "../helpers/chains";
import BigNumber from "bignumber.js";
import { getUniqStartOfTodayTimestamp } from "../helpers/getUniSubgraphVolume";
import { FetchResultFees, SimpleAdapter } from "../adapters/types";

const ONE_DAY_IN_SECONDS = 60 * 60 * 24

const endpoint = "https://api.thegraph.com/subgraphs/name/symmiograph/base_analytics_8"

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

const fetchVolume = async (timestamp: number): Promise<FetchResultFees> => {
  const response: IGraphResponse = await request(endpoint, query, {
    from: String(timestamp - ONE_DAY_IN_SECONDS),
    to: String(timestamp)
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

  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date((timestamp * 1000)))

  return {
    timestamp: dayTimestamp,

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
  adapter: {
    [CHAIN.BASE]: {
      fetch: fetchVolume,
      start: 1691332847
    }
  }
}
export default adapter;
