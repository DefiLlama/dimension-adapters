import { FetchOptions, FetchResult, SimpleAdapter } from '../adapters/types'
import { CHAIN } from '../helpers/chains'
import ADDRESSES from '../helpers/coreAssets.json'

// TrueMarkets contract addresses on Base: https://github.com/truemarketsorg/true-contracts/blob/main/network_config.json
const FEE_COLLECTOR = '0x39339E149c2D916aa899Bf73D2Debb15F4755d9D'
const UNISWAP_V4_POOL_MANAGER = '0x498581fF718922c3f8e6A244956aF099B2652b2b'
const UNISWAP_V4_POSITION_MANAGER = '0x7c5f5a4bbd8fd63184577525326123b519429bdc'

const TYD_TOKEN = '0xb13CF163d916917d9cD6E836905cA5f12a1dEF4B'.toLowerCase()

const POOL_FEE_TRACKED_EVENT =
  'event PoolFeeTracked(bytes32 indexed poolId, address indexed currency, uint256 amount)'
const UNISWAP_V4_SWAP_EVENT =
  'event Swap(bytes32 indexed id, address indexed sender, int128 amount0, int128 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint24 fee)'
const SWAP_TOPIC = '0x40e9cecb9f5f1f1c5b9c97dec2917b7ee92e57ba5563708daca94dd84ad7112f'
const POOL_KEYS_ABI =
  'function poolKeys(bytes25) view returns (address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks)'

// Extract bytes25 pool key from bytes32 pool ID
function getPoolKey(poolId: string): string {
  return poolId.slice(0, 52)
}

async function fetch(options: FetchOptions): Promise<FetchResult> {
  const dailyVolume = options.createBalances()
  const dailyFees = options.createBalances()

  // fetch PoolFeeTracked events to identify TrueMarkets pool IDs
  const feeTrackedLogs = await options.getLogs({
    target: FEE_COLLECTOR,
    eventAbi: POOL_FEE_TRACKED_EVENT,
  })

  // Extract unique pool IDs from fee events
  const poolIds = [...new Set(feeTrackedLogs.map((log: any) => log.poolId as string))]

  // Process fees
  feeTrackedLogs.forEach((log: any) => {
    const currency = log.currency.toLowerCase()
    if (currency === TYD_TOKEN.toLowerCase()) {
      dailyFees.add(ADDRESSES.base.USDC, log.amount)
    } else {
      dailyFees.add(log.currency, log.amount)
    }
  })

  // Query pool configuration to determine token order (currency0 vs currency1)
  const poolConfigs = await options.api.multiCall({
    abi: POOL_KEYS_ABI,
    calls: poolIds.map((poolId) => ({
      target: UNISWAP_V4_POSITION_MANAGER,
      params: [getPoolKey(poolId)],
    })),
    permitFailure: true,
  })

  // Build map of poolId -> TYD position (0 or 1)
  const poolTydPosition: Record<string, 0 | 1> = {}
  poolIds.forEach((poolId, i) => {
    if (poolConfigs[i]) {
      const currency0 = poolConfigs[i].currency0.toLowerCase()
      const currency1 = poolConfigs[i].currency1.toLowerCase()
      if (currency0 === TYD_TOKEN) {
        poolTydPosition[poolId] = 0
      } else if (currency1 === TYD_TOKEN) {
        poolTydPosition[poolId] = 1
      }
    }
  })

  // Fetch Swap events filtered by poolId (topic1)
  const swapLogsPerPool = await Promise.all(
    poolIds.map((poolId) =>
      options
        .getLogs({
          target: UNISWAP_V4_POOL_MANAGER,
          topics: [SWAP_TOPIC, poolId],
          eventAbi: UNISWAP_V4_SWAP_EVENT,
        })
        .then((logs) => logs.map((log: any) => ({ ...log, poolId })))
    )
  )

  // Calculate volume from swaps using pool configuration
  swapLogsPerPool.flat().forEach((log: any) => {
    const tydPosition = poolTydPosition[log.poolId]
    if (tydPosition === undefined) return

    const amount0 = BigInt(log.amount0)
    const amount1 = BigInt(log.amount1)
    const tydAmount = tydPosition === 0 ? amount0 : amount1
    const absTydAmount = tydAmount < 0n ? -tydAmount : tydAmount

    dailyVolume.add(ADDRESSES.base.USDC, absTydAmount)
  })

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  }
}

const methodology = {
  Volume:
    'Volume is calculated from Uniswap V4 Swap events for TrueMarkets prediction market pools (YES-TYD and NO-TYD). Only the TYD side of swaps is counted to represent USD volume.',
  Fees: 'Fees are tracked via PoolFeeTracked events on the FeeCollector contract. Fees in TYD are converted to USDC equivalent.',
  Revenue: 'All collected fees are considered protocol revenue.',
  ProtocolRevenue: 'All fees go to the protocol treasury and fee recipients.',
}

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.BASE]: {
      fetch,
      start: '2024-12-19',
    },
  },
  methodology,
}

export default adapter
