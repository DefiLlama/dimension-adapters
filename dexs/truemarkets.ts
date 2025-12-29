import { FetchOptions, FetchResult, SimpleAdapter } from '../adapters/types'
import { CHAIN } from '../helpers/chains'
import ADDRESSES from '../helpers/coreAssets.json'
import { filterPools2 } from '../helpers/uniswap'

// TrueMarkets contract addresses on Base: https://github.com/truemarketsorg/true-contracts/blob/main/network_config.json
const TRUTH_MARKET_MANAGER = '0x61A98Bef11867c69489B91f340fE545eEfc695d7'
const FEE_COLLECTOR = '0x39339E149c2D916aa899Bf73D2Debb15F4755d9D'
const UNISWAP_V4_POOL_MANAGER = '0x498581fF718922c3f8e6A244956aF099B2652b2b'
const UNISWAP_V4_POSITION_MANAGER = '0x7c5f5a4bbd8fd63184577525326123b519429bdc'
const TYD_TOKEN = '0xb13CF163d916917d9cD6E836905cA5f12a1dEF4B'.toLowerCase()
const USDC_TOKEN = ADDRESSES.base.USDC.toLowerCase()
const ZERO_ADDRESS = ADDRESSES.null

const ABI = {
  numberOfActiveMarkets: 'uint256:numberOfActiveMarkets',
  getActiveMarketAddress: 'function getActiveMarketAddress(uint256 index) view returns (address)',
  getPoolIds: 'function getPoolIds() view returns (bytes32, bytes32)',
  getPoolAddresses: 'function getPoolAddresses() view returns (address, address)',
  poolKeys:
    'function poolKeys(bytes25) view returns (address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks)',
  token0: 'address:token0',
  PoolFeeTracked:
    'event PoolFeeTracked(bytes32 indexed poolId, address indexed currency, uint256 amount)',
  SwapV4:
    'event Swap(bytes32 indexed id, address indexed sender, int128 amount0, int128 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint24 fee)',
  SwapV3:
    'event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)',
}

const SWAP_TOPIC_V4 = '0x40e9cecb9f5f1f1c5b9c97dec2917b7ee92e57ba5563708daca94dd84ad7112f'
const getPoolKey = (poolId: string) => poolId.slice(0, 52)

async function fetch(options: FetchOptions): Promise<FetchResult> {
  const dailyVolume = options.createBalances()
  const dailyFees = options.createBalances()

  const feeTrackedLogs = await options.getLogs({
    target: FEE_COLLECTOR,
    eventAbi: ABI.PoolFeeTracked,
  })

  const v4PoolIdsFromFees = [...new Set(feeTrackedLogs.map((log: any) => log.poolId as string))]

  feeTrackedLogs.forEach((log: any) => {
    const currency = log.currency.toLowerCase()
    dailyFees.add(currency === TYD_TOKEN ? USDC_TOKEN : log.currency, log.amount)
  })

  if (v4PoolIdsFromFees.length > 0) {
    const poolConfigs = await options.api.multiCall({
      abi: ABI.poolKeys,
      calls: v4PoolIdsFromFees.map((poolId) => ({
        target: UNISWAP_V4_POSITION_MANAGER,
        params: [getPoolKey(poolId)],
      })),
      permitFailure: true,
    })

    const v4TydPos: Record<string, 0 | 1> = {}
    v4PoolIdsFromFees.forEach((poolId, i) => {
      if (poolConfigs[i]) {
        v4TydPos[poolId] = poolConfigs[i].currency0.toLowerCase() === TYD_TOKEN ? 0 : 1
      }
    })

    const v4SwapLogs = await Promise.all(
      v4PoolIdsFromFees.map((poolId) =>
        options
          .getLogs({
            target: UNISWAP_V4_POOL_MANAGER,
            topics: [SWAP_TOPIC_V4, poolId],
            eventAbi: ABI.SwapV4,
          })
          .then((logs) => logs.map((log: any) => ({ ...log, poolId })))
      )
    )

    v4SwapLogs.flat().forEach((log: any) => {
      const pos = v4TydPos[log.poolId]
      if (pos === undefined) return
      const amount = BigInt(pos === 0 ? log.amount0 : log.amount1)
      dailyVolume.add(ADDRESSES.base.USDC, amount < 0n ? -amount : amount)
    })
  }

  const numMarkets = await options.api.call({
    target: TRUTH_MARKET_MANAGER,
    abi: ABI.numberOfActiveMarkets,
  })

  if (numMarkets && Number(numMarkets) > 0) {
    // Batch fetch all market addresses
    const marketAddresses = await options.api.multiCall({
      abi: ABI.getActiveMarketAddress,
      calls: Array.from({ length: Number(numMarkets) }, (_, i) => ({
        target: TRUTH_MARKET_MANAGER,
        params: [i],
      })),
    })

    // Batch fetch V3 pool addresses (V1 markets)
    const poolAddrsResults = await options.api.multiCall({
      abi: ABI.getPoolAddresses,
      calls: marketAddresses,
      permitFailure: true,
    })

    // Collect valid V3 pool addresses
    const v3Pools: string[] = []
    poolAddrsResults.forEach((result: any) => {
      if (!result) return
      const [yesPool, noPool] = result
      if (yesPool && yesPool !== ZERO_ADDRESS) v3Pools.push(yesPool.toLowerCase())
      if (noPool && noPool !== ZERO_ADDRESS) v3Pools.push(noPool.toLowerCase())
    })

    const uniqueV3Pools = [...new Set(v3Pools)]

    if (uniqueV3Pools.length > 0) {
      const USDC = ADDRESSES.base.USDC.toLowerCase()

      const [token0s, token1s] = await Promise.all([
        options.api.multiCall({ abi: ABI.token0, calls: uniqueV3Pools }),
        options.api.multiCall({ abi: 'address:token1', calls: uniqueV3Pools }),
      ])

      const { pairs: activePools, pairObject } = await filterPools2({
        fetchOptions: options,
        pairs: uniqueV3Pools,
        token0s,
        token1s,
        maxPairSize: 100,
        minUSDValue: 100,
      })

      if (activePools.length > 0) {
        // Build stablecoin position map for active pools only
        const v3StablePos: Record<string, 0 | 1> = {}
        activePools.forEach((pool: string) => {
          const token0 = pairObject[pool][0].toLowerCase()
          v3StablePos[pool] = token0 === TYD_TOKEN || token0 === USDC ? 0 : 1
        })

        const v3SwapLogs = await options.getLogs({
          targets: activePools,
          eventAbi: ABI.SwapV3,
          flatten: false,
        })

        v3SwapLogs.forEach((logs: any[], i: number) => {
          const pool = activePools[i]
          const pos = v3StablePos[pool]
          if (pos === undefined) return
          logs.forEach((log: any) => {
            const amount = BigInt(pos === 0 ? log.amount0 : log.amount1)
            dailyVolume.add(ADDRESSES.base.USDC, amount < 0n ? -amount : amount)
          })
        })
      }
    }
  }

  return { dailyVolume, dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees }
}

const methodology = {
  Volume:
    'Volume is calculated from Swap events on TrueMarkets prediction market pools. V1 markets use Uniswap V3 pools (USDC pairs), V2 markets use Uniswap V4 pools (TYD pairs). Only the stablecoin side of swaps is counted.',
  Fees: 'Fees are tracked via PoolFeeTracked events from the FeeCollector contract (V4 pools only).',
  Revenue: 'All collected fees are considered protocol revenue.',
}

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.BASE]: {
      fetch,
      start: '2025-03-07',
    },
  },
  methodology,
}

export default adapter
