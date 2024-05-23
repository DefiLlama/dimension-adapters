import { postURL } from '../../utils/fetchURL'
import { FetchResult, SimpleAdapter } from '../../adapters/types'
import { CHAIN } from '../../helpers/chains'

const URL = 'https://leaderboard-production.rage.trade'
const endpoint = '/api/stats/defillama'
const arbitrumStartTimestamp = 1701302400 // 2023-11-30 00:00:00
const optimismStartTimestamp = 1701302400 // 2023-11-30 00:00:00
const ethereumStartTimestamp = 1710374400 // 2023-11-30 00:00:00

const fetch =
  (chain: string) =>
  async (timestamp: number): Promise<FetchResult> => {
    const { dailyVolume: dailyVolumeE30, totalVolume: totalVolumeE30 } =
      await postURL(`${URL}${endpoint}`, {
        timestamp,
        chain,
      })

    return {
      dailyVolume: dailyVolumeE30 ? dailyVolumeE30 / 1e30 : 0,
      totalVolume: totalVolumeE30 ? totalVolumeE30 / 1e30 : 0,
      timestamp,
    }
  }

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch: fetch(CHAIN.ARBITRUM),
      start: arbitrumStartTimestamp,
    },
    [CHAIN.ETHEREUM]: {
      fetch: fetch(CHAIN.ETHEREUM),
      start: ethereumStartTimestamp,
    },
    [CHAIN.OPTIMISM]: {
      fetch: fetch(CHAIN.OPTIMISM),
      start: optimismStartTimestamp,
    },
  },
}

export default adapter
