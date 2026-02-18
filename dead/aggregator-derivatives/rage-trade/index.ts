import { postURL } from '../../utils/fetchURL'
import { FetchOptions, FetchResult, SimpleAdapter } from '../../adapters/types'
import { CHAIN } from '../../helpers/chains'

const URL = 'https://leaderboard-production.rage.trade'
const endpoint = '/api/stats/defillama'

const fetch = async (timestamp: number, _b:any, options: FetchOptions): Promise<FetchResult> => {
    const { dailyVolume: dailyVolumeE30 } =
      await postURL(`${URL}${endpoint}`, {
        timestamp,
        chain: options.chain,
      })

    return {
      dailyVolume: dailyVolumeE30 ? dailyVolumeE30 / 1e30 : 0
    }
}

const adapter: SimpleAdapter = {
  deadFrom: '2025-10-01', // Rage Trade is sunnted
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch,
      start: '2023-11-30',
    },
    [CHAIN.ETHEREUM]: {
      fetch,
      start: '2023-11-30',
    },
    [CHAIN.OPTIMISM]: {
      fetch,
      start: '2023-11-30',
    },
  },
}

export default adapter
