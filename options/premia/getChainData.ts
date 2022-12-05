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
    totalFeeRevenueDailies {
      id
      timestamp
      totalFeeRevenueInUsd
    }
    totalVolumeDailies {
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

function getLast(array: Array<any>): any {
  if (!Array.isArray(array) || array.length === 0) return {}
  const lastIdx = array.length - 1
  return array[lastIdx]
}

function toNumber(value: string): number {
  return Number(utils.formatEther(value))
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
  const dailyPremiumVolume = toNumber(
    getLast(totalFeeRevenueDailies).totalFeeRevenueInUsd
  )
  const totalNotionalVolume = toNumber(totalVolumes[0].totalVolumeInUsd)
  const dailyNotionalVolume = toNumber(
    getLast(totalVolumeDailies).totalVolumeInUsd
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
