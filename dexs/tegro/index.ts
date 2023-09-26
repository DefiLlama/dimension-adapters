import { Adapter } from '../../adapters/types'
import { gql, request } from 'graphql-request'

const endpoints = {
  ethereum: 'https://api.thegraph.com/subgraphs/name/ashtegro/tegro',
  polygon: 'https://api.thegraph.com/subgraphs/name/ashtegro/tegro-polygon',
  avax: 'https://api.thegraph.com/subgraphs/name/ashtegro/tegro-avax',
  bsc: 'https://api.thegraph.com/subgraphs/name/ashtegro/tegro-bnb',
  arbitrum: 'https://api.thegraph.com/subgraphs/name/ashtegro/tegro-arbitrum',
}

const getNumberOfDay = (date: Date) => {
  const now: Date = new Date()
  const timeDifference = now.getTime() - date.getTime()
  return Math.floor(timeDifference / (24 * 60 * 60 * 1000))
}

const getVolume = async (queryUrl: string) => {
  const start = new Date('1970-01-01T00:00:00Z')
  const todayDayNumber = getNumberOfDay(start)

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
        const res = await getVolume(endpoints.ethereum)
        return {
          timestamp,
          ...res,
        }
      },
      start: async () => 0
    },
    polygon: {
      fetch: async (timestamp: number) => {
        const res = await getVolume(endpoints.polygon)
        return {
          timestamp,
          ...res,
        }
      },
      start: async () => 0
    },
    avax: {
      fetch: async (timestamp: number) => {
        const res = await getVolume(endpoints.avax)
        return {
          timestamp,
          ...res,
        }
      },
      start: async () => 0
    },
    bsc: {
      fetch: async (timestamp: number) => {
        const res = await getVolume(endpoints.bsc)
        return {
          timestamp,
          ...res,
        }
      },
      start: async () => 0
    },
    arbitrum: {
      fetch: async (timestamp: number) => {
        const res = await getVolume(endpoints.arbitrum)
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
