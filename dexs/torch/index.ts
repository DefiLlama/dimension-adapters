import fetchURL from '../../utils/fetchURL'
import { FetchOptions, SimpleAdapter } from '../../adapters/types'

const fetch = async (options: FetchOptions) => {
  const dailyVolumeResult = await fetchURL(
    'https://api.torch.finance/stats/daily-volume',
  )

  return {
    dailyVolume: dailyVolumeResult.dailyVolume,
  }
}

const adapter: SimpleAdapter = {
  adapter: {
    ton: {
      fetch,
      start: '2024-09-02',
    },
  },
}

export default adapter
