import { utils } from 'ethers'
import { request, gql } from 'graphql-request'

interface GqlResult {
  totalFeeRevenues: [{ totalFeeRevenueInUsd: string }]
  totalFeeRevenueDailies: Array<{
    id: string
    timestamp: string
    totalFeeRevenueInUsd: string
  }>
  totalVolumes: [{ totalVolumeInUsd: string }]
  totalVolumeDailies: Array<{
    id: string
    timestamp: string
    totalVolumeInUsd: string
  }>
}

const chainDataQuery = gql`
  query feeAndVolumeQuery {
    totalVolumes {
      totalVolumeInUsd
    }
    totalFeeRevenues {
      totalFeeRevenueInUsd
    }
    totalFeeRevenueDailies(orderDirection: desc, orderBy: timestamp) {
      id
      timestamp
      totalFeeRevenueInUsd
    }
    totalVolumeDailies(orderDirection: desc, orderBy: timestamp) {
      id
      timestamp
      totalVolumeInUsd
    }
  }
`

interface ChainData {
  totalPremiumVolume: number
  dailyPremiumVolume: number
  totalNotionalVolume: number
  dailyNotionalVolume: number
  timestamp: string
}

function get2Days(array: Array<any>, key: string): [string, string] {
  if (!Array.isArray(array) || array.length <= 2) return ['0', '0']
  return array.slice(1, 3).map((obj) => obj[key]) as [string, string]
}

function toNumber(value: string): number {
  return Number(utils.formatEther(value))
}

function calcLast24hrsVolume(values: [string, string]): number {
  return toNumber(values[0]) - toNumber(values[1])
}

async function getChainData(
  url: string,
  timestamp: string
): Promise<ChainData> {
  const result: GqlResult = await request(url, chainDataQuery)

  const {
    totalFeeRevenueDailies,
    totalFeeRevenues,
    totalVolumeDailies,
    totalVolumes,
  } = result
  const totalPremiumVolume = toNumber(totalFeeRevenues[0].totalFeeRevenueInUsd)
  const dailyPremiumVolume = calcLast24hrsVolume(
    get2Days(totalFeeRevenueDailies, 'totalFeeRevenueInUsd')
  )
  console.log(totalFeeRevenueDailies)
  console.log(get2Days(totalFeeRevenueDailies, 'totalFeeRevenueInUsd'))

  const totalNotionalVolume = toNumber(totalVolumes[0].totalVolumeInUsd)
  const dailyNotionalVolume = calcLast24hrsVolume(
    get2Days(totalVolumeDailies, 'totalVolumeInUsd')
  )

  return {
    timestamp,
    totalNotionalVolume,
    dailyNotionalVolume,
    totalPremiumVolume,
    dailyPremiumVolume,
  }
}

export default getChainData
