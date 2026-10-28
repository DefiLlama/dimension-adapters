import { FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { request, } from "graphql-request";

export default {
  chains: [CHAIN.SOMNIA],
  fetch,
  start: '2025-09-02',
}


async function fetch({ startOfDay }: FetchOptions) {
  const yesterday = startOfDay - 86400
  const endpoint = 'https://api.subgraph.somnia.network/api/public/962dcbf6-75ff-4e54-b778-6b5816c05e7d/subgraphs/somnia-perp/v1.0.0/gn'
  const query = `{
  today: perpPools {
    snap (where: { timestamp: ${startOfDay}}) {
      totalTrade
      totalFees
    }
  }

  previous: perpPools {
    snap (
      first: 1,
      where: { timestamp_lte: ${yesterday} },
      orderBy: timestamp,
      orderDirection: desc
    ) {
      totalTrade
      totalFees
    }
  }
  }`

  const res = await request(endpoint, query)
  // some days have 0 volume, so a snapshot may be missing; that does not mean the adapter is broken
  if (!res.today.length || res.today[0].snap.length !== 1) {
    return { dailyVolume: 0, dailyFees: 0, }
  }

  const sumField = (pools: any[], field: 'totalTrade' | 'totalFees') =>
    pools.reduce((total, pool) => total + (pool.snap[0] ? Number(pool.snap[0][field]) : 0), 0)

  const volToday = sumField(res.today, 'totalTrade')
  const volPrevious = sumField(res.previous, 'totalTrade')
  const feesToday = sumField(res.today, 'totalFees')
  const feesPrevious = sumField(res.previous, 'totalFees')

  const dailyVolume = volToday - volPrevious
  const dailyFees = feesToday - feesPrevious

  return { dailyVolume, dailyFees, }

}