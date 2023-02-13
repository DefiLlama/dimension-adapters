import { CHAIN } from '../helpers/chains'
import { SimpleAdapter, ChainEndpoints } from '../adapters/types'
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

interface DailyFee {
  timestamp: string
  dailyFees: string
  dailyRevenue: string
  totalRevenue: string
  totalFees: string
}

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

async function getDailyFee(url: string, timestamp: number): Promise<DailyFee> {
  const fetchResult = await request(url, dailyFeesQuery, {
    timestamp: timestamp.toString(),
  })
  const { totalPremiumsDailies, totalFeeRevenueDailies, totalFeeRevenues } =
    fetchResult

  const dailyPremiums = calcLast24hrsVolume(
    get2Days(totalPremiumsDailies, 'totalPremiumsInUsd')
  )

  const dailyRevenue = calcLast24hrsVolume(
    get2Days(totalFeeRevenueDailies, 'totalFeeRevenueInUsd')
  )

  const totalPremiumsInUsd = toNumber(
    totalPremiumsDailies[0].totalPremiumsInUsd
  )

  return {
    // map totalPremiumDailies to Fee
    dailyFees: dailyPremiums.toFixed(2),
    // map totalFeeRevenue to Revenue
    dailyRevenue: dailyRevenue.toFixed(2),
    timestamp: timestamp.toString(),
    totalFees: totalPremiumsInUsd.toFixed(2),
    totalRevenue: toNumber(totalFeeRevenues[0].totalFeeRevenueInUsd).toFixed(2),
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
