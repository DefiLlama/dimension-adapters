import { FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { request, } from "graphql-request";

export default {
  chains: [CHAIN.SOMNIA],
  fetch,
  styart: '2025-09-02',
}


async function fetch(_: any, _1: any, { startOfDay }: FetchOptions) {
  const yesterday = startOfDay - 86400
  const endpoint = 'https://api.subgraph.somnia.network/api/public/962dcbf6-75ff-4e54-b778-6b5816c05e7d/subgraphs/somnia-perp/v1.0.0/gn'
  const query = `{
  today: perpPools {
    snap (where: { timestamp: ${startOfDay}}) {
      totalTrade
      totalFees
    }
  }

  yesterday: perpPools {
    snap (where: { timestamp: ${yesterday}}) {
      totalTrade
      totalFees
    }
  }
  }`

  const res = await request(endpoint, query)
  if (!res.today.length || !res.yesterday.length || res.today[0].snap.length !== 1 || res.yesterday[0].snap.length !== 1)
    throw new Error("Error: No data")

  const volToday = res.today.reduce((a: number, b) => a + Number(b.snap[0].totalTrade), 0)
  const volYesterday = res.yesterday.reduce((a: number, b) => a + Number(b.snap[0].totalTrade), 0)
  const feesToday = res.today.reduce((a: number, b) => a + Number(b.snap[0].totalFees), 0)
  const feesYesterday = res.yesterday.reduce((a: number, b) => a + Number(b.snap[0].totalFees), 0)

  const dailyVolume = volToday - volYesterday
  const dailyFees = feesToday - feesYesterday

  return { dailyVolume, dailyFees, }

}