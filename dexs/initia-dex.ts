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

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue: 0,
    dailyProtocolRevenue: 0,
    dailySupplySideRevenue: dailyFees,
  }
}

const methodology = {
  Volume:
    "Daily swap volume across all initia pools, including Weighted (Balancer), StableSwap, CLAMM, and Minitswap pools.",

  Fees:
    "Daily swap fees.",

  Revenue:
    "Zero. Initia does not retain any portion of swap fees. All swap fees remain within their respective liquidity pools.",

  ProtocolRevenue:
    "Zero. No share of swap fees is directed to the Initia protocol or treasury.",

  SupplySideRevenue:
    "All fees accrue to liquidity providers by increasing the value of assets held in each pool.",
};

export default {
  adapter: {
    [CHAIN.INITIA]: {
      fetch,
      runAtCurrTime: true,
    },
  },
  methodology,
}
