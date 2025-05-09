import { CHAIN } from "../helpers/chains"
import { httpGet } from "../utils/fetchURL"

async function fetch() {

  let paginationKey = ''
  let dailyVolume = 0
  let dailyFees = 0

  do {
    const { pools, pagination } = await httpGet(`https://dex-api.initia.xyz/indexer/dex/v1/pools?type=ALL&pagination.count_total=true&pagination.key=${paginationKey}&pagination.limit=100`)
    paginationKey = pagination.next_key
    pools.forEach((pool: any) => {
      dailyVolume += pool.volume_24h / 1e6
      dailyFees += pool.volume_24h * pool.swap_fee_rate / 1e6
    })
  } while (paginationKey)

  return { dailyFees, dailyVolume }
}

export default {
  adapter: {
      [CHAIN.INITIA]: {
        fetch,
        runAtCurrTime: true,
      },
  },
}