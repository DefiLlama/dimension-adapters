import { CHAIN } from '../helpers/chains'
import { SimpleAdapter, ChainEndpoints } from '../adapters/types'
import { request, gql } from 'graphql-request'
import { utils } from 'ethers'

const dailyFeesQuery = gql`
  query MyQuery {
    totalFeeRevenueDailies(orderDirection: desc, orderBy: timestamp) {
      id
      timestamp
      totalFeeRevenueInUsd
    }
  }
`

interface DailyFee {
  timestamp: string
  dailyFees: string
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

async function getDailyFee(url: string, timestamp: string): Promise<DailyFee> {
  const fetchResult = await request(url, dailyFeesQuery)
  const { totalFeeRevenueDailies } = fetchResult

  const dailyFees = calcLast24hrsVolume(
    get2Days(totalFeeRevenueDailies, 'totalFeeRevenueInUsd')
  )

  return {
    dailyFees: dailyFees.toFixed(2),
    timestamp,
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
        fetch: async (ts: string) => await getDailyFee(endpoints[chain], ts),
        start: async () => 1656154800,
      },
    }
  }, {}),
}

export default adapter
