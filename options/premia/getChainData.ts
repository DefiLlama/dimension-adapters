import { utils } from 'ethers'
import { request, gql } from 'graphql-request'

interface GqlResult {
  totalPremiumsDailies: Array<{
    id: string
    timestamp: string
    totalPremiumsInUsd: string
  }>
  totalVolumes: [{ totalVolumeInUsd: string }]
  totalVolumeDailies: Array<{
    id: string
    timestamp: string
    totalVolumeInUsd: string
  }>
}

const chainDataQuery = gql`
  query feeAndVolumeQuery($timestamp: Int) {
    totalVolumes {
      totalVolumeInUsd
    }
    totalPremiumsDailies(orderDirection: desc, orderBy: timestamp, where: { timestamp_lte: $timestamp }) {
      id
      timestamp
      totalPremiumsInUsd
    }
    totalVolumeDailies(orderDirection: desc, orderBy: timestamp, where: { timestamp_lte: $timestamp }) {
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
  const result: GqlResult = await request(url, chainDataQuery, {
    timestamp: timestamp,
  })

  const {
    totalPremiumsDailies,
    totalVolumeDailies,
    totalVolumes,
  } = result
  const totalPremiumVolume = toNumber(totalPremiumsDailies[0].totalPremiumsInUsd)
  const dailyPremiumVolume = calcLast24hrsVolume(
    get2Days(totalPremiumsDailies, 'totalPremiumsInUsd')
  )

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
