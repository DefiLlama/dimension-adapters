import { FetchOptions, FetchResult, SimpleAdapter } from '../adapters/types'
import { CHAIN } from '../helpers/chains'
import ADDRESSES from '../helpers/coreAssets.json'
import { getPositionedLogArgs, PositionedLogArgs, toPositionedLogArgs } from '../helpers/logs'
import { filterPools2 } from '../helpers/uniswap'

// Trueo contract addresses on Base: https://github.com/trueo-protocol/trueo-contracts/blob/main/network_config.json
const TRUTH_MARKET_MANAGER = '0x61A98Bef11867c69489B91f340fE545eEfc695d7'
// A dedicated FeeCollector is deployed per Uniswap v4 hook generation. Every generation that has
// been live must be read: a retired hook keeps charging fees until its markets resolve, so dropping
// the old collector undercounts and pinning only the old one misses everything current.
const FEE_COLLECTORS = [
  // hook 0x1cFeAD8E66cebC5E51093Dfd247Ad34f841740c4 (0.2%, fees from 2025-10-21): 2 pools give 50% to the creator, the rest goes to the protocol
  '0x39339E149c2D916aa899Bf73D2Debb15F4755d9D',
  // hook 0x3E83479B2276EcFb7C7181F67b5d092d3511e0C4 (0.8%, Launchpad markets, fees from 2026-06-29): every pool gives 100% to its creator
  '0x8C6c622A7DE8cEbD1A43e2Fb8363ebbE9120134F',
]
const FEE_RATE_DENOMINATOR = 10000n
const SWAP_FEE_DENOMINATOR = 1_000_000n
const LAUNCHPAD = '0xeD3ebc2e17a0CC20D22Ff7b7d13488F187fD1af6'
const LAUNCHPAD_FEE_RECEIVER = '0x3F168219dadf4460dC6Ad93eaa3641340C1330D6'
const UNISWAP_V4_POOL_MANAGER = '0x498581fF718922c3f8e6A244956aF099B2652b2b'
const UNISWAP_V4_POSITION_MANAGER = '0x7c5f5a4bbd8fd63184577525326123b519429bdc'
const TYD_TOKEN = '0xb13CF163d916917d9cD6E836905cA5f12a1dEF4B'.toLowerCase()
const TYD_UNIT = 10n ** 6n
const TYD_LAUNCH = '2025-07-02T04:27:23Z'
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
  fee: 'uint24:fee',
  convertToAssets: 'function convertToAssets(uint256 shares) view returns (uint256)',
  getPoolRecipients:
    'function getPoolRecipients((address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks) poolKey) view returns ((address recipient, uint256 feeRate, string role)[] recipients)',
  PoolFeeTracked:
    'event PoolFeeTracked(bytes32 indexed poolId, address indexed currency, uint256 amount)',
  Transfer: 'event Transfer(address indexed from, address indexed to, uint256 value)',
  SwapV4:
    'event Swap(bytes32 indexed id, address indexed sender, int128 amount0, int128 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint24 fee)',
  SwapV3:
    'event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)',
}

const SWAP_TOPIC_V4 = '0x40e9cecb9f5f1f1c5b9c97dec2917b7ee92e57ba5563708daca94dd84ad7112f'
const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'
const addressTopic = (address: string) => '0x' + address.slice(2).toLowerCase().padStart(64, '0')
const getPoolKey = (poolId: string) => poolId.slice(0, 52)
const abs = (x: bigint) => (x < 0n ? -x : x)
// Pool ids are OR'd into topic1; chunked so the filter stays a sane size.
const POOL_ID_CHUNK = 500

async function fetch(options: FetchOptions): Promise<FetchResult> {
  const dailyVolume = options.createBalances()
  const dailyFees = options.createBalances()
  const dailyRevenue = options.createBalances()
  const dailySupplySideRevenue = options.createBalances()

  const tydAssetsPerShare = options.endTimestamp * 1000 > Date.parse(TYD_LAUNCH)
    ? BigInt(await options.api.call({ target: TYD_TOKEN, abi: ABI.convertToAssets, params: [TYD_UNIT.toString()] }))
    : TYD_UNIT
  const tydToUsdc = (shares: bigint) => (shares * tydAssetsPerShare) / TYD_UNIT

  const feeLogsByCollector = await options.getLogs({
    targets: FEE_COLLECTORS,
    eventAbi: ABI.PoolFeeTracked,
    onlyArgs: false,
    flatten: false,
  })
  const feeTrackedLogs = feeLogsByCollector.flatMap((logs: any[], i: number) =>
    logs.map((log): PositionedLogArgs & { collector: string } => ({ ...toPositionedLogArgs(log), collector: FEE_COLLECTORS[i] }))
  )

  // Launchpad protocol fees: charged on proposal graduation (launch) and on
  // Live-phase withdrawals, paid in TYD from the Launchpad to the fee receiver
  const launchpadFeeTransfers = await options.getLogs({
    target: TYD_TOKEN,
    eventAbi: ABI.Transfer,
    topics: [TRANSFER_TOPIC, addressTopic(LAUNCHPAD), addressTopic(LAUNCHPAD_FEE_RECEIVER)],
  })
  launchpadFeeTransfers.forEach((log: any) => {
    const fee = tydToUsdc(BigInt(log.value))
    dailyFees.add(USDC_TOKEN, fee, "Launchpad Fees")
    dailyRevenue.add(USDC_TOKEN, fee, "Launchpad Fees")
  })

  const v4PoolKeys: Record<string, any> = {}
  const v4TydPos: Record<string, 0 | 1> = {}
  const v4SwapsByPool: Record<string, PositionedLogArgs[]> = {}

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

    const v4PoolIdSet = new Set(v4PoolIds)
    const uniqueV4PoolIds = [...v4PoolIdSet]

    if (uniqueV4PoolIds.length > 0) {
      const v4SwapLogs: PositionedLogArgs[] = []
      const tradedPoolIds = new Set<string>()

      for (let i = 0; i < uniqueV4PoolIds.length; i += POOL_ID_CHUNK) {
        const logs = await getPositionedLogArgs(options, {
          target: UNISWAP_V4_POOL_MANAGER,
          topics: [SWAP_TOPIC_V4, uniqueV4PoolIds.slice(i, i + POOL_ID_CHUNK)] as any,
          eventAbi: ABI.SwapV4,
          // The indexer drops an OR'd topic1 list and returns every v4 swap on Base (and answers 414
          // once the list is long), so the pool-id filter goes to the RPC, which applies it.
          skipIndexer: true,
        })
        logs.forEach((log) => {
          const poolId = String(log.id).toLowerCase()
          if (!v4PoolIdSet.has(poolId)) return
          v4SwapLogs.push(log)
          tradedPoolIds.add(poolId)
          if (!v4SwapsByPool[poolId]) v4SwapsByPool[poolId] = []
          v4SwapsByPool[poolId].push(log)
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

        tradedPoolIdList.forEach((poolId, i) => {
          const poolKey = poolConfigs[i]
          if (!poolKey) return
          v4PoolKeys[poolId] = poolKey
          if (poolKey.currency0.toLowerCase() === TYD_TOKEN) v4TydPos[poolId] = 0
          else if (poolKey.currency1.toLowerCase() === TYD_TOKEN) v4TydPos[poolId] = 1
        })

        v4SwapLogs.forEach((log) => {
          const pos = v4TydPos[String(log.id).toLowerCase()]
          if (pos === undefined) return
          const amount = tydToUsdc(abs(BigInt(pos === 0 ? log.amount0 : log.amount1)))
          dailyVolume.add(USDC_TOKEN, amount)
          const lpFee = (amount * BigInt(log.fee)) / SWAP_FEE_DENOMINATOR
          dailyFees.add(USDC_TOKEN, lpFee, "LP Fees")
          dailySupplySideRevenue.add(USDC_TOKEN, lpFee, "LP Fees To Liquidity Providers")
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
        const v3StableToken: Record<string, string> = {}
        activePools.forEach((pool: string) => {
          const [token0, token1] = pairObject[pool].map((token: string) => token.toLowerCase())
          if (token0 === TYD_TOKEN || token0 === USDC_TOKEN) {
            v3StablePos[pool] = 0
            v3StableToken[pool] = token0
          } else if (token1 === TYD_TOKEN || token1 === USDC_TOKEN) {
            v3StablePos[pool] = 1
            v3StableToken[pool] = token1
          }
        })

        const v3PoolFees = await options.api.multiCall({ abi: ABI.fee, calls: activePools })
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
            const stableAmount = abs(BigInt(pos === 0 ? log.amount0 : log.amount1))
            const amount = v3StableToken[pool] === TYD_TOKEN ? tydToUsdc(stableAmount) : stableAmount
            dailyVolume.add(USDC_TOKEN, amount)
            // Uniswap LP fee at the pool's fee tier, taken from the input side and valued at the swap's price
            const lpFee = (amount * BigInt(v3PoolFees[i])) / SWAP_FEE_DENOMINATOR
            dailyFees.add(USDC_TOKEN, lpFee, "LP Fees")
            dailySupplySideRevenue.add(USDC_TOKEN, lpFee, "LP Fees To Liquidity Providers")
          })
        })
      }
    }
  }

  const feePools = [...new Set(feeTrackedLogs.map((log) => `${log.collector}|${String(log.poolId).toLowerCase()}`))]
  const recipientLists = await options.api.multiCall({
    abi: ABI.getPoolRecipients,
    calls: feePools.map((feePool) => {
      const [collector, poolId] = feePool.split('|')
      const poolKey = v4PoolKeys[poolId]
      if (!poolKey) throw new Error(`truemarkets: fee tracked for pool ${poolId}, which is not a traded market pool`)
      const { currency0, currency1, fee, tickSpacing, hooks } = poolKey
      return { target: collector, params: [[currency0, currency1, fee, tickSpacing, hooks]] as any }
    }),
  })
  const creatorRates: Record<string, bigint> = {}
  feePools.forEach((feePool, i) => {
    creatorRates[feePool] = 0n
    recipientLists[i].forEach((recipient: any) => {
      if (recipient.role !== 'creator') throw new Error(`truemarkets: unexpected fee recipient role ${recipient.role} on ${feePool}`)
      creatorRates[feePool] += BigInt(recipient.feeRate)
    })
  })

  feeTrackedLogs.forEach((log) => {
    const poolId = String(log.poolId).toLowerCase()
    let feeInTyd = BigInt(log.amount)
    if (log.currency.toLowerCase() !== TYD_TOKEN) {
      const pos = v4TydPos[poolId]
      if (pos === undefined) return
      const swap = (v4SwapsByPool[poolId] ?? [])
        .filter((s) => s.blockNumber === log.blockNumber && s.logIndex < log.logIndex)
        .reduce<PositionedLogArgs | undefined>((last, s) => (!last || s.logIndex > last.logIndex ? s : last), undefined)
      if (!swap) throw new Error(`truemarkets: no swap found for fee in pool ${poolId} at block ${log.blockNumber}`)
      const tydAmount = abs(BigInt(pos === 0 ? swap.amount0 : swap.amount1))
      const feeCurrencyAmount = abs(BigInt(pos === 0 ? swap.amount1 : swap.amount0))
      feeInTyd = (feeInTyd * tydAmount) / feeCurrencyAmount
    }
    const fee = tydToUsdc(feeInTyd)
    const toCreators = (fee * creatorRates[`${log.collector}|${poolId}`]) / FEE_RATE_DENOMINATOR
    dailyFees.add(USDC_TOKEN, fee, "Trading Fees")
    dailySupplySideRevenue.add(USDC_TOKEN, toCreators, "Trading Fees To Creators")
    dailyRevenue.add(USDC_TOKEN, fee - toCreators, "Trading Fees To Protocol")
  })

  return { dailyVolume, dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue.clone(), dailySupplySideRevenue }
}

const methodology = {
  Volume:
    'Volume is calculated from Swap events on TrueMarkets prediction market pools, enumerated from the active markets on TruthMarketManager. V1 markets use Uniswap V3 pools (USDC pairs), V2 markets use Uniswap V4 pools (TYD pairs). Only the stablecoin side of swaps is counted, with TYD (a yield-bearing USDC vault share) converted to USDC at its share price; pools quoted in the outcome token of another market are skipped.',
  Fees: 'Swap fees paid by traders: the TrueMarkets hook fee on Uniswap V4 market pools (0.2% on the original markets, 0.8% on Launchpad markets) and the Uniswap LP fee on market pools (0.8% on the original V4 markets, the pool fee tier on V3 markets), plus Launchpad fees charged on proposal graduation and Live-phase withdrawals. Fees taken in outcome tokens are valued at the price of the swap that paid them.',
  Revenue: 'Swap fees that go to the protocol rather than to market creators or liquidity providers, plus all Launchpad fees.',
  ProtocolRevenue: 'Swap fees that go to the protocol treasury rather than to market creators or liquidity providers, plus all Launchpad fees.',
  SupplySideRevenue: 'Swap fees paid out to market creators (100% of the hook fee on Launchpad markets and 50% on two of the original markets) and Uniswap LP fees earned by market liquidity providers.',
}

const breakdownMethodology = {
  Fees: {
    "Trading Fees": "Swap fees charged by the hook on V4 market pools, from PoolFeeTracked events on each hook's FeeCollector. Fees taken in outcome tokens (exact-input buys) are valued in TYD at the execution price of the swap that paid them.",
    "LP Fees": "Uniswap LP fees on market pools: the Swap event fee on V4 pools (0.8% on the original markets, 1 pip on Launchpad markets) and the pool fee tier on V3 pools, applied to the stablecoin side of each swap.",
    "Launchpad Fees": "Launchpad protocol fees (charged on proposal graduation and Live-phase withdrawals) are tracked via TYD transfers from the Launchpad to the fee receiver.",
  },
  Revenue: {
    "Trading Fees To Protocol": "Share of swap fees paid to the FeeCollector's default (protocol) recipient: everything not assigned to a market creator.",
    "Launchpad Fees": "Launchpad protocol fees (charged on proposal graduation and Live-phase withdrawals) are tracked via TYD transfers from the Launchpad to the fee receiver.",
  },
  ProtocolRevenue: {
    "Trading Fees To Protocol": "Share of swap fees paid to the FeeCollector's default (protocol) recipient: everything not assigned to a market creator.",
    "Launchpad Fees": "Launchpad protocol fees (charged on proposal graduation and Live-phase withdrawals) are tracked via TYD transfers from the Launchpad to the fee receiver.",
  },
  SupplySideRevenue: {
    "Trading Fees To Creators": "Share of swap fees assigned to the market creator in the pool's FeeCollector recipient config (100% on Launchpad markets).",
    "LP Fees To Liquidity Providers": "Uniswap LP fees earned by the liquidity providers of market pools.",
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
