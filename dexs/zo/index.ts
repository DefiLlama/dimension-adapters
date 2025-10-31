import fetchURL from '../../utils/fetchURL'
import { FetchOptions, SimpleAdapter } from '../../adapters/types'
import { CHAIN } from '../../helpers/chains'

const url = {
  [CHAIN.SUI]: 'https://api.zofinance.io/volume',
}

const fetch = async (_1: number, _: any, { startOfDay, chain, }: FetchOptions) => {
  const volume = await fetchURL(`${url[chain]}?timestamp=${startOfDay}`)
  return {
    dailyVolume: volume?.dailyVolume,
    timestamp: startOfDay,
  }
}

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.SUI]: {
      fetch,
      start: '2025-04-06',
    },
  },
}

export default adapter
