import fetchURL from '../../utils/fetchURL'
import { FetchOptions, SimpleAdapter } from '../../adapters/types'
import { CHAIN } from '../../helpers/chains'

const url = {
  [CHAIN.SUI]: 'https://api.zofinance.io/volume',
}

const fetch = async ({ startOfDay, chain, }: FetchOptions) => {
  const volume = await fetchURL(`${url[chain]}?timestamp=${startOfDay}`)
  return {
    dailyVolume: volume?.dailyVolume,
  }
}

const adapter: SimpleAdapter = {
  fetch,
  chains: [CHAIN.SUI],
  start: '2025-04-06',
}

export default adapter
