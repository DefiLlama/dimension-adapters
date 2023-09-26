import { Adapter } from '../../adapters/types'
import { gql, request } from 'graphql-request'

const endpoints = {
  ethereum: 'https://api.thegraph.com/subgraphs/name/ashtegro/tegro',
  polygon: 'https://api.thegraph.com/subgraphs/name/ashtegro/tegro-polygon',
  avax: 'https://api.thegraph.com/subgraphs/name/ashtegro/tegro-avax',
  bsc: 'https://api.thegraph.com/subgraphs/name/ashtegro/tegro-bnb',
  arbitrum: 'https://api.thegraph.com/subgraphs/name/ashtegro/tegro-arbitrum',
}

const getNumberOfDay = (timestamp: number) => {
  return Math.floor(timestamp / (24 * 60 * 60))
}

const getVolume = async (queryUrl: string, timestamp: number) => {
  const todayDayNumber = getNumberOfDay(timestamp)

  const volumeQuery = gql`
    query TotalAndDailyVolumes {
      dailyVolume(id: ${todayDayNumber}) {
        volume
      }
      totalVolumes {
        volume
        id
      }
    }`
  
  const res = await request(queryUrl, volumeQuery)
  return {
    dailyVolume: res.dailyVolume?.volume || '0',
    totalVolume: res.totalVolumes.reduce((acc: number, item: { volume: number; id: string }) => acc + Number(item.volume), 0)
  }
}

const adapter: Adapter = {
  adapter: {
    ethereum: {
      fetch: async (timestamp: number) => {
        const res = await getVolume(endpoints.ethereum, timestamp)
        return {
          timestamp,
          ...res,
        }
      },
      start: async () => 0
    },
    polygon: {
      fetch: async (timestamp: number) => {
        const res = await getVolume(endpoints.polygon, timestamp)
        return {
          timestamp,
          ...res,
        }
      },
      start: async () => 0
    },
    avax: {
      fetch: async (timestamp: number) => {
        const res = await getVolume(endpoints.avax, timestamp)
        return {
          timestamp,
          ...res,
        }
      },
      start: async () => 0
    },
    bsc: {
      fetch: async (timestamp: number) => {
        const res = await getVolume(endpoints.bsc, timestamp)
        return {
          timestamp,
          ...res,
        }
      },
      start: async () => 0
    },
    arbitrum: {
      fetch: async (timestamp: number) => {
        const res = await getVolume(endpoints.arbitrum, timestamp)
        return {
          timestamp,
          ...res,
        }
      },
      start: async () => 0
    },
  },
}

export default adapter
