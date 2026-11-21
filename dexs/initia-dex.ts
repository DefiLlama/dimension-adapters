import { FetchOptions } from "../adapters/types"
import { CHAIN } from "../helpers/chains"
import { httpGet } from "../utils/fetchURL"

const STATUS_URL = 'https://rpc.initia.xyz/status'
const STATUS_TIMEOUT = 10000
const MAX_HEAD_LAG = 3600

async function fetch(options: FetchOptions) {
  const snapshotTime = Math.max(options.endTimestamp, Math.floor(Date.now() / 1000))
  const covers = `the 24 hours ending ${new Date(snapshotTime * 1000).toISOString()}`
  let syncInfo: any
  try {
    syncInfo = (await httpGet(STATUS_URL, { timeout: STATUS_TIMEOUT })).result?.sync_info
  } catch (e: any) {
    throw new Error(`initia ${STATUS_URL} is unreachable (${e?.message}), so the dex api volume_24h cannot be shown to cover ${covers}`)
  }
  const headTime = Date.parse(syncInfo?.latest_block_time) / 1000
  if (!(snapshotTime - headTime <= MAX_HEAD_LAG))
    throw new Error(`initia latest block ${syncInfo?.latest_block_height} is from ${syncInfo?.latest_block_time}, so the dex api volume_24h is a stale snapshot and does not cover ${covers}`)

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
