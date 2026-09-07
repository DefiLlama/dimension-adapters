import { FetchOptions, FetchResult, SimpleAdapter } from '../adapters/types'
import { CHAIN } from '../helpers/chains'
import ADDRESSES from '../helpers/coreAssets.json'
import { addTokensReceived } from '../helpers/token'
import { filterPools2 } from '../helpers/uniswap'

// Trueo contract addresses on Base: https://github.com/trueo-protocol/trueo-contracts/blob/main/network_config.json
const TRUTH_MARKET_MANAGER = '0x61A98Bef11867c69489B91f340fE545eEfc695d7'
// A dedicated FeeCollector is deployed per Uniswap v4 hook generation. Every generation that has
// been live must be read: a retired hook keeps charging fees until its markets resolve, so dropping
// the old collector undercounts and pinning only the old one misses everything current.
const FEE_COLLECTORS = [
  '0x39339E149c2D916aa899Bf73D2Debb15F4755d9D', // hook 0x1cFeAD8E66cebC5E51093Dfd247Ad34f841740c4
  '0x8C6c622A7DE8cEbD1A43e2Fb8363ebbE9120134F', // hook 0x3E83479B2276EcFb7C7181F67b5d092d3511e0C4 (current)
]
const LAUNCHPAD = '0xeD3ebc2e17a0CC20D22Ff7b7d13488F187fD1af6'
const LAUNCHPAD_FEE_RECEIVER = '0x3F168219dadf4460dC6Ad93eaa3641340C1330D6'
const UNISWAP_V4_POOL_MANAGER = '0x498581fF718922c3f8e6A244956aF099B2652b2b'
const UNISWAP_V4_POSITION_MANAGER = '0x7c5f5a4bbd8fd63184577525326123b519429bdc'
const TYD_TOKEN = '0xb13CF163d916917d9cD6E836905cA5f12a1dEF4B'.toLowerCase()
const USDC_TOKEN = ADDRESSES.base.USDC.toLowerCase()
const ZERO_ADDRESS = ADDRESSES.null
const ZERO_BYTES32 = '0x' + '0'.repeat(64)

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
// Pool ids are OR'd into topic1; chunked so the filter stays a sane size.
const POOL_ID_CHUNK = 500

async function fetch(options: FetchOptions): Promise<FetchResult> {
  const dailyVolume = options.createBalances()
  const dailyFees = options.createBalances()
  const launchpadFees = options.createBalances()

  const feeTrackedLogs = await options.getLogs({
    targets: FEE_COLLECTORS,
    eventAbi: ABI.PoolFeeTracked,
  })

  // Launchpad protocol fees: charged on proposal graduation (launch) and on
  // Live-phase withdrawals, paid in TYD from the Launchpad to the fee receiver
  await addTokensReceived({
    options,
    targets: [LAUNCHPAD_FEE_RECEIVER],
    fromAddressFilter: LAUNCHPAD,
    tokens: [TYD_TOKEN],
    balances: launchpadFees,
    tokenTransform: (token: string) => (token.toLowerCase() === TYD_TOKEN ? USDC_TOKEN : token),
  })

  dailyFees.add(launchpadFees, "Launchpad Fees")

  feeTrackedLogs.forEach((log: any) => {
    const currency = log.currency.toLowerCase()
    dailyFees.add(currency === TYD_TOKEN ? USDC_TOKEN : log.currency, log.amount, "Trading Fees")
  })

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

    // V2 markets: Uniswap v4 pool ids come from the markets themselves, not from FeeCollector fee
    // events. Deriving them from fees coupled volume to the fee configuration: a FeeCollector
    // rotation, a protocol fee set to 0 (the hook returns early and emits nothing), or a swap whose
    // fee rounds to zero all silently zeroed the volume of pools that were trading normally.
    const poolIdResults = await options.api.multiCall({
      abi: ABI.getPoolIds,
      calls: marketAddresses,
      permitFailure: true,
    })

    const v4PoolIds: string[] = []
    poolIdResults.forEach((result: any) => {
      if (!result) return
      const [yesPoolId, noPoolId] = result
      if (yesPoolId && yesPoolId !== ZERO_BYTES32) v4PoolIds.push(yesPoolId.toLowerCase())
      if (noPoolId && noPoolId !== ZERO_BYTES32) v4PoolIds.push(noPoolId.toLowerCase())
    })

    const uniqueV4PoolIds = [...new Set(v4PoolIds)]

    if (uniqueV4PoolIds.length > 0) {
      const v4SwapLogs: any[] = []
      const tradedPoolIds = new Set<string>()

      for (let i = 0; i < uniqueV4PoolIds.length; i += POOL_ID_CHUNK) {
        const logs = await options.getLogs({
          target: UNISWAP_V4_POOL_MANAGER,
          topics: [SWAP_TOPIC_V4, uniqueV4PoolIds.slice(i, i + POOL_ID_CHUNK)] as any,
          eventAbi: ABI.SwapV4,
        })
        logs.forEach((log: any) => {
          v4SwapLogs.push(log)
          tradedPoolIds.add(String(log.id).toLowerCase())
        })
      }

      // Resolve currency order only for the pools that actually traded, not all of them.
      const tradedPoolIdList = [...tradedPoolIds]

      if (tradedPoolIdList.length > 0) {
        const poolConfigs = await options.api.multiCall({
          abi: ABI.poolKeys,
          calls: tradedPoolIdList.map((poolId) => ({
            target: UNISWAP_V4_POSITION_MANAGER,
            params: [getPoolKey(poolId)],
          })),
          permitFailure: true,
        })

        const v4TydPos: Record<string, 0 | 1> = {}
        tradedPoolIdList.forEach((poolId, i) => {
          if (poolConfigs[i]) {
            v4TydPos[poolId] = poolConfigs[i].currency0.toLowerCase() === TYD_TOKEN ? 0 : 1
          }
        })

        v4SwapLogs.forEach((log: any) => {
          const pos = v4TydPos[String(log.id).toLowerCase()]
          if (pos === undefined) return
          const amount = BigInt(pos === 0 ? log.amount0 : log.amount1)
          dailyVolume.add(ADDRESSES.base.USDC, amount < 0n ? -amount : amount)
        })
      }
    }

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
    'Volume is calculated from Swap events on TrueMarkets prediction market pools, enumerated from the active markets on TruthMarketManager. V1 markets use Uniswap V3 pools (USDC pairs), V2 markets use Uniswap V4 pools (TYD pairs). Only the stablecoin side of swaps is counted.',
  Fees: 'Trading fees are tracked via PoolFeeTracked events from the FeeCollector contracts (V4 pools only; one per hook generation). Launchpad protocol fees (charged on proposal graduation and Live-phase withdrawals) are tracked via TYD transfers from the Launchpad to the fee receiver.',
  Revenue: 'All the trading fees (v4 pools only) and launchpad fees are considered revenue.',
  ProtocolRevenue: 'All the trading fees (v4 pools only) and launchpad fees are considered protocol revenue.',
}

const breakdownMethodology = {
  Fees: {
    "Trading Fees": "Trading fees are tracked via PoolFeeTracked events from the FeeCollector contracts (V4 pools only; one per hook generation).",
    "Launchpad Fees": "Launchpad protocol fees (charged on proposal graduation and Live-phase withdrawals) are tracked via TYD transfers from the Launchpad to the fee receiver.",
  },
  Revenue: {
    "Trading Fees": "Trading fees are tracked via PoolFeeTracked events from the FeeCollector contracts (V4 pools only; one per hook generation).",
    "Launchpad Fees": "Launchpad protocol fees (charged on proposal graduation and Live-phase withdrawals) are tracked via TYD transfers from the Launchpad to the fee receiver.",
  },
  ProtocolRevenue: {
    "Trading Fees": "Trading fees are tracked via PoolFeeTracked events from the FeeCollector contracts (V4 pools only; one per hook generation).",
    "Launchpad Fees": "Launchpad protocol fees (charged on proposal graduation and Live-phase withdrawals) are tracked via TYD transfers from the Launchpad to the fee receiver.",
  },
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  adapter: {
    [CHAIN.BASE]: {
      fetch,
      start: '2025-03-07',
    },
  },
  methodology,
  breakdownMethodology,
}

export default adapter
