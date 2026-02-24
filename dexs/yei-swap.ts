import { CHAIN } from "../helpers/chains"
import { httpGet } from "../utils/fetchURL"

async function fetch() {
  let dailyVolume = 0
  let dailyFees = 0

  const { pools, } = await httpGet(`https://swap-api.yei.finance/pools`)
  pools.forEach((pool: any) => {
    dailyVolume += pool.volume_24h
    dailyFees += pool.fee_24h
  })

  return { dailyFees, dailyVolume }
}

export default {
  adapter: {
    [CHAIN.SEI]: {
      fetch,
      runAtCurrTime: true,
    },
  },
}