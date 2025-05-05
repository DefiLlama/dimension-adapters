import fetchURL from "../utils/fetchURL"
import { CHAIN } from "../helpers/chains"

async function fetch() {
  const pools = (await fetchURL("https://stats.mosaic.ag/v1/public/pools")).data.pools
  const dailyFees = pools.reduce((fees: number, pool: any) => fees + pool.stats.fee_24h_usd, 0,)

  return { dailyFees, }
}

export default {
  adapter: {
    [CHAIN.MOVE]: {
      fetch,
      runAtCurrTime: true,
    },
  },
}
