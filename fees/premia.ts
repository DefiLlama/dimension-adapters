import { CHAIN } from '../helpers/chains'
import { SimpleAdapter, ChainEndpoints, FetchResultFees } from '../adapters/types'
import { request, gql } from 'graphql-request'
import { utils } from 'ethers'

const dailyFeesQuery = gql`
  query MyQuery($timestamp: String) {
    totalFeeRevenues {
      totalFeeRevenueInUsd
    }
    totalPremiumsDailies(
      orderDirection: desc
      orderBy: timestamp
      where: { timestamp_lte: $timestamp }
    ) {
      id
      timestamp
      totalPremiumsInUsd
    }
    totalFeeRevenueDailies(
      orderDirection: desc
      orderBy: timestamp
      where: { timestamp_lte: $timestamp }
    ) {
      id
      timestamp
      totalFeeRevenueInUsd
    }
  }
`

export function toNumber(value: string): number {
  return Number(utils.formatEther(value))
}

export function calcLast24hrsVolume(values: [string, string]): number {
  return toNumber(values[0]) - toNumber(values[1])
}

function get2Days(array: Array<any>, key: string): [string, string] {
  if (!Array.isArray(array) || array.length <= 2) return ['0', '0']
  return array.slice(1, 3).map((obj) => obj[key]) as [string, string]
}

async function getDailyFee(url: string, timestamp: number): Promise<FetchResultFees> {
  const fetchResult = await request(url, dailyFeesQuery, {
    timestamp: timestamp.toString(),
  })
  const { totalFeeRevenueDailies } = fetchResult

  const dailyRevenue = calcLast24hrsVolume(
    get2Days(totalFeeRevenueDailies, 'totalFeeRevenueInUsd')
  )

  const totalFees = toNumber(
    totalFeeRevenueDailies[0].totalFeeRevenueInUsd
  )

  return {
    dailyFees: dailyRevenue.toString(),
    dailyUserFees: dailyRevenue.toString(),
    dailyRevenue: dailyRevenue.toString(),
    timestamp: timestamp,
    totalRevenue: totalFees.toString(),
    totalFees: totalFees.toString()
  }
}

const endpoints: ChainEndpoints = {
  [CHAIN.ARBITRUM]:
    'https://api.thegraph.com/subgraphs/name/premiafinance/premia-arbitrum',
  [CHAIN.ETHEREUM]:
    'https://api.thegraph.com/subgraphs/name/premiafinance/premiav2',
  [CHAIN.FANTOM]:
    'https://api.thegraph.com/subgraphs/name/premiafinance/premia-fantom',
  [CHAIN.OPTIMISM]:
    'https://api.thegraph.com/subgraphs/name/premiafinance/premia-optimism',
}

const adapter: SimpleAdapter = {
  adapter: Object.keys(endpoints).reduce((acc, chain) => {
    return {
      ...acc,
      [chain]: {
        fetch: async (ts: number) => await getDailyFee(endpoints[chain], ts),
        start: async () => 1656154800,
      },
    }
  }, {}),
}

export default adapter
