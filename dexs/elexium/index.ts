import { SimpleAdapter } from "../../adapters/types"
import { httpGet } from "../../utils/fetchURL"

const url = 'https://api.elexium.finance/pools'

const fetchVolume = async () => {
  const res = await httpGet(url)
  const dailyVolume = res.reduce((acc: number, pool: any) => {
    return acc + pool.volume
  }, 0)
  return {
    dailyVolume: dailyVolume
  }
}

const adapter: SimpleAdapter = {
  adapter: {
    'alephium': {
      fetch: fetchVolume,
      runAtCurrTime: true,
      start: '2022-06-12',
    }
  }
}

export default adapter
