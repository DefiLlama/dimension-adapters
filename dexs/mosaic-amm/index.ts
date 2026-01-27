import fetchURL from "../../utils/fetchURL"
import { CHAIN } from "../../helpers/chains"

async function fetch() {
  const pools = (await fetchURL("https://stats.mosaic.ag/v1/public/pools")).data.pools
  const dailyVolume = pools.reduce((volume: number, pool: any) => volume + pool.stats.volume_24h_usd, 0,)

  return { dailyVolume: dailyVolume, }
}

export default {
  adapter: {
    [CHAIN.MOVE]: {
      runAtCurrTime: true,
      fetch,
    },
  },
}
