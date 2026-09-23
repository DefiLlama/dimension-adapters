import { cache } from '@defillama/sdk'
import { Adapter, FetchOptions } from '../../adapters/types'
import { CHAIN } from '../../helpers/chains'
import { METRIC } from '../../helpers/metrics'
import { addOneToken } from '../../helpers/prices'
import { getUniV3LogAdapter } from '../../helpers/uniswap'

// Synthra (synthra.org): Uniswap V3-style AMM, Synthra Launch bonding curves and an LP locker for
// graduated launches, deployed on Robinhood Chain and Arc.

// Every pool of every Synthra factory (V3 and V3.1, both chains) has slot0.feeProtocol = 0x33:
// one third of each swap fee goes to the factory fee recipient
// 0x1CAB229e4D75E4DE0EC890bef0295a32BAaa1328 and two thirds accrue to in-range liquidity.
const PROTOCOL_SHARE_OF_POOL_FEE = 1 / 3

type ChainConfig = {
  start: string
  quote: string // quote asset of Launch curves
  factories: string[] // V3, V3.1
  launchpads: string[]
  lpLocker: string
  // positions locked at graduation are minted by the original V3 NonfungiblePositionManager
  lockerPositionManager: string
  lockerFactory: string
  // The Robinhood Chain RPC cannot serve the historical balance multicalls of the generic pool
  // filter, and drained launch pools must keep the swaps they had. Every pool comes from the
  // canonical factory, so nothing unknown is counted.
  skipPoolFilter?: boolean
}

const CONFIG: Record<string, ChainConfig> = {
  [CHAIN.ROBINHOOD]: {
    start: '2026-07-14',
    quote: '0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73', // WETH
    factories: ['0x6307fc239C7964942c1BfFE51930E55606619c74', '0x8f419898da502d3f49ef379775507210de2bfe3a'],
    launchpads: ['0xFc645480c1F40c03DeaBD9fD54E6BC42d0b3863E', '0x3D26D96BC9d1C3FcAE0D156E830c723051364847'],
    lpLocker: '0xf32257816D64651F7e7b43529607Eb2ede294EE3',
    lockerPositionManager: '0x2743b771659fD9CE13970d7367e7e84AF6a31049',
    lockerFactory: '0x6307fc239C7964942c1BfFE51930E55606619c74',
    skipPoolFilter: true,
  },
  [CHAIN.ARC]: {
    start: '2026-07-30',
    quote: '0x3600000000000000000000000000000000000000', // USDC
    factories: ['0x6307fc239C7964942c1BfFE51930E55606619c74', '0x84169f9adf4f5f0e483bfc350498a85b1d7ec638'],
    launchpads: ['0x18D33De5eefB2F91B09385f35f6a1317659cc1F9'],
    lpLocker: '0xCE8E6ec91d39b5a0b36920DA5d69f82C253e05f2',
    lockerPositionManager: '0x2743b771659fD9CE13970d7367e7e84AF6a31049',
    lockerFactory: '0x6307fc239C7964942c1BfFE51930E55606619c74',
  },
}

const TRADE_EVENT =
  'event Trade(address indexed token, address indexed trader, bool isBuy, uint256 usdcAmount, uint256 tokenAmount, uint256 fee, uint128 virtualUsdc, uint128 virtualTokens, uint128 realTokenReserves, uint128 realUsdcReserves)'
const FEE_SPLIT_EVENT =
  'event FeeSplit(address indexed token, uint256 toProtocol, uint256 toCreator, uint256 toBuybackPot, uint128 buybackPot)'
const BUYBACK_EXECUTED_EVENT =
  'event BuybackExecuted(address indexed token, uint256 usdcSpent, uint256 tokensBurned, uint128 remainingPot, uint128 totalTokensBurned)'
const LEFTOVER_POT_SETTLED_EVENT = 'event LeftoverPotSettled(address indexed token, uint256 toProtocol, uint256 toCreator)'
const SWAP_EVENT =
  'event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)'

const LABEL = {
  v3Volume: 'V3 pools',
  launchVolume: 'Launch bonding curves',
  v3Fees: 'V3 pool swap fees',
  launchFees: METRIC.SWAP_FEES,
  v3Protocol: 'V3 protocol fees',
  lockedProtocol: 'Locked launch LP fees to protocol',
  launchProtocol: 'Launch curve fees to protocol',
  leftoverProtocol: 'Leftover launch pot to protocol',
  v3Lp: 'V3 LP fees',
  lockedCreator: 'Locked launch LP fees to creators',
  launchCreator: 'Launch fees to creators',
  leftoverCreator: 'Leftover launch pot to creator',
  launchBuyback: METRIC.TOKEN_BUY_BACK,
} as const

type LockedPool = {
  pool: string; token0: string; token1: string; fee: number
  tickLower: number; tickUpper: number; liquidity: bigint; creatorShare: number
}

// Positions minted at graduation are held by the LpLocker. It collects their LP fees and splits
// them: creatorFeeShareBps (read per position, currently 30%) to the creator, the rest to the
// protocol treasury. These positions are full range and their liquidity never changes, so the
// locked share of every swap in their pool is exactly lockedLiquidity / in-range liquidity (the
// liquidity field of that Swap). It is recognized when the fee accrues, like the pool protocol fee.
async function lockedPools({ api }: FetchOptions, config: ChainConfig): Promise<LockedPool[]> {
  const count = await api.call({ target: config.lockerPositionManager, abi: 'function balanceOf(address) view returns (uint256)', params: [config.lpLocker] })
  if (!Number(count)) return []
  const tokenIds = await api.multiCall({
    target: config.lockerPositionManager,
    abi: 'function tokenOfOwnerByIndex(address owner, uint256 index) view returns (uint256)',
    calls: Array.from({ length: Number(count) }, (_, i) => ({ params: [config.lpLocker, i] })),
  })
  const positions = await api.multiCall({
    target: config.lockerPositionManager,
    abi: 'function positions(uint256) view returns (uint96 nonce, address operator, address token0, address token1, uint24 fee, int24 tickLower, int24 tickUpper, uint128 liquidity, uint256 feeGrowthInside0LastX128, uint256 feeGrowthInside1LastX128, uint128 tokensOwed0, uint128 tokensOwed1)',
    calls: tokenIds,
  })
  const locks = await api.multiCall({
    target: config.lpLocker,
    abi: 'function positions(uint256) view returns (address launchToken, address creator, uint16 creatorFeeShareBps, uint64 lockedAt, bool exists)',
    calls: tokenIds,
  })
  const pools = await api.multiCall({
    target: config.lockerFactory,
    abi: 'function getPool(address, address, uint24) view returns (address)',
    calls: positions.map((p: any) => ({ params: [p.token0, p.token1, p.fee] })),
  })
  return positions
    .map((p: any, i: number) => ({
      pool: String(pools[i]).toLowerCase(),
      token0: p.token0,
      token1: p.token1,
      fee: Number(p.fee) / 1e6,
      tickLower: Number(p.tickLower),
      tickUpper: Number(p.tickUpper),
      liquidity: BigInt(p.liquidity),
      creatorShare: Number(locks[i].creatorFeeShareBps) / 1e4,
    }))
    .filter((l: LockedPool) => l.liquidity > 0n)
}

// Pools are discovered from the PoolCreated log cache that the Synthra TVL adapter keeps per
// factory. A factory generation may exist before its first pool (V3.1 on Robinhood Chain): that
// generation contributes nothing. A missing cache is an error, never a zero.
async function factoryHasPools(chain: string, factory: string): Promise<boolean> {
  const { logs } = await cache.readCache(`tvl-adapter-cache/cache/logs/${chain}/${factory.toLowerCase()}.json`, { readFromR2Cache: true })
  if (!Array.isArray(logs)) throw new Error(`Synthra pool cache missing for ${chain}:${factory}`)
  return logs.length > 0
}

export async function fetch(options: FetchOptions) {
  const config = CONFIG[options.chain]
  const dailyVolume = options.createBalances()
  const dailyFees = options.createBalances()
  const dailyUserFees = options.createBalances()
  const dailyRevenue = options.createBalances()
  const dailyProtocolRevenue = options.createBalances()
  const dailyHoldersRevenue = options.createBalances()
  const dailySupplySideRevenue = options.createBalances()

  const locked = await lockedPools(options, config)
  const lockedAddresses = locked.map((l) => l.pool)

  // Pools without a locked position: generic V3 accounting, one factory generation at a time.
  for (const factory of config.factories) {
    if (!(await factoryHasPools(options.chain, factory))) continue
    const v3 = await getUniV3LogAdapter({
      factory,
      userFeesRatio: 1,
      revenueRatio: PROTOCOL_SHARE_OF_POOL_FEE,
      protocolRevenueRatio: PROTOCOL_SHARE_OF_POOL_FEE,
      blacklistPools: lockedAddresses,
      skipPoolFilter: config.skipPoolFilter,
    })(options)
    dailyVolume.addBalances(v3.dailyVolume, LABEL.v3Volume)
    dailyFees.addBalances(v3.dailyFees, LABEL.v3Fees)
    if (v3.dailyUserFees) dailyUserFees.addBalances(v3.dailyUserFees, LABEL.v3Fees)
    if (v3.dailyRevenue) dailyRevenue.addBalances(v3.dailyRevenue, LABEL.v3Protocol)
    if (v3.dailyProtocolRevenue) dailyProtocolRevenue.addBalances(v3.dailyProtocolRevenue, LABEL.v3Protocol)
    if (v3.dailySupplySideRevenue) dailySupplySideRevenue.addBalances(v3.dailySupplySideRevenue, LABEL.v3Lp)
  }

  // Pools holding a locked launch position: the same volume and fee rules as the generic helper,
  // with the LP share split between the locker (protocol / creator) and the other LPs.
  if (locked.length) {
    const swaps = await options.getLogs({ targets: lockedAddresses, eventAbi: SWAP_EVENT, flatten: false })
    swaps.forEach((logs: any[], index: number) => {
      const l = locked[index]
      logs.forEach((log: any) => {
        addOneToken({ chain: options.chain, balances: dailyVolume, token0: l.token0, token1: l.token1, amount0: log.amount0, amount1: log.amount1, label: LABEL.v3Volume })
        const fee = addOneToken({
          chain: options.chain, balances: dailyFees, token0: l.token0, token1: l.token1,
          amount0: Number(log.amount0.toString()) * l.fee, amount1: Number(log.amount1.toString()) * l.fee, label: LABEL.v3Fees,
        })
        dailyUserFees.add(fee.token, fee.amount, LABEL.v3Fees)
        const protocolPoolFee = fee.amount * PROTOCOL_SHARE_OF_POOL_FEE
        dailyRevenue.add(fee.token, protocolPoolFee, LABEL.v3Protocol)
        dailyProtocolRevenue.add(fee.token, protocolPoolFee, LABEL.v3Protocol)

        const lpFee = fee.amount - protocolPoolFee
        const tick = Number(log.tick)
        const active = BigInt(log.liquidity)
        const inRange = tick >= l.tickLower && tick < l.tickUpper && active > 0n
        const lockedShare = inRange ? Math.min(1, Number(l.liquidity) / Number(active)) : 0
        const lockedFee = lpFee * lockedShare
        const toCreator = lockedFee * l.creatorShare
        const toProtocol = lockedFee - toCreator
        dailyRevenue.add(fee.token, toProtocol, LABEL.lockedProtocol)
        dailyProtocolRevenue.add(fee.token, toProtocol, LABEL.lockedProtocol)
        dailySupplySideRevenue.add(fee.token, toCreator, LABEL.lockedCreator)
        dailySupplySideRevenue.add(fee.token, lpFee - lockedFee, LABEL.v3Lp)
      })
    })
  }

  const [trades, feeSplits, buybacks, leftoverSettlements] = await Promise.all([
    options.getLogs({ targets: config.launchpads, eventAbi: TRADE_EVENT }),
    options.getLogs({ targets: config.launchpads, eventAbi: FEE_SPLIT_EVENT }),
    options.getLogs({ targets: config.launchpads, eventAbi: BUYBACK_EXECUTED_EVENT }),
    options.getLogs({ targets: config.launchpads, eventAbi: LEFTOVER_POT_SETTLED_EVENT }),
  ])

  trades.forEach((trade: any) => {
    dailyVolume.add(config.quote, trade.usdcAmount, LABEL.launchVolume)
    dailyFees.add(config.quote, trade.fee, LABEL.launchFees)
    dailyUserFees.add(config.quote, trade.fee, LABEL.launchFees)
  })
  feeSplits.forEach((split: any) => {
    dailyRevenue.add(config.quote, split.toProtocol, LABEL.launchProtocol)
    dailyProtocolRevenue.add(config.quote, split.toProtocol, LABEL.launchProtocol)
    dailySupplySideRevenue.add(config.quote, split.toCreator, LABEL.launchCreator)
  })
  // The buyback pot has no final beneficiary when FeeSplit fires. It is recognized only when it is
  // actually spent on a launched-token buyback or divided at graduation.
  buybacks.forEach((buyback: any) => {
    dailyRevenue.add(config.quote, buyback.usdcSpent, LABEL.launchBuyback)
    dailyHoldersRevenue.add(config.quote, buyback.usdcSpent, LABEL.launchBuyback)
  })
  leftoverSettlements.forEach((settlement: any) => {
    dailyRevenue.add(config.quote, settlement.toProtocol, LABEL.leftoverProtocol)
    dailyProtocolRevenue.add(config.quote, settlement.toProtocol, LABEL.leftoverProtocol)
    dailySupplySideRevenue.add(config.quote, settlement.toCreator, LABEL.leftoverCreator)
  })

  return { dailyVolume, dailyFees, dailyUserFees, dailyRevenue, dailyProtocolRevenue, dailyHoldersRevenue, dailySupplySideRevenue }
}

export const methodology = {
  Volume: 'Swap volume across all pools of the Synthra V3 and V3.1 factories plus the gross quote-asset notional of Synthra Launch bonding-curve buys and sells.',
  Fees: 'All fees paid by traders in Synthra pools (each pool fee tier) and on Synthra Launch curves (the exact Trade fee).',
  UserFees: 'Same as Fees: all reported trading fees are paid directly by users.',
  Revenue: 'Pool protocol fees, the protocol share of fees earned by launch positions locked at graduation, Launch protocol shares, and executed launched-token buybacks.',
  ProtocolRevenue: 'One third of every pool fee, the protocol share of fees earned by locked launch positions, exact Launch toProtocol shares and any leftover pot sent to the protocol at graduation.',
  HoldersRevenue: 'Quote asset actually spent on launched-token buybacks. Pending buyback pots are not recognized before execution.',
  SupplySideRevenue: 'Pool LP fees of every position except the protocol share of locked launch positions, creator shares of locked launch positions, exact Launch creator shares and leftover pot sent to creators at graduation.',
}

export const breakdownMethodology = {
  Volume: {
    [LABEL.launchVolume]: 'Gross quote amount, including fees, emitted by each curve Trade.',
    [LABEL.v3Volume]: 'Swap volume emitted by every pool of the Synthra V3 and V3.1 factories.',
  },
  Fees: {
    [LABEL.v3Fees]: 'Swap fees paid in Synthra pools, calculated from each pool fee tier.',
    [LABEL.launchFees]: 'Exact fee emitted by each Synthra Launch Trade.',
  },
  UserFees: {
    [LABEL.v3Fees]: 'Swap fees paid in Synthra pools, calculated from each pool fee tier.',
    [LABEL.launchFees]: 'Exact fee emitted by each Synthra Launch Trade.',
  },
  Revenue: {
    [LABEL.v3Protocol]: 'One third of every pool fee, sent to the Synthra fee recipient (feeProtocol = 3).',
    [LABEL.lockedProtocol]: 'Protocol share of the LP fees earned by launch positions locked at graduation.',
    [LABEL.launchProtocol]: 'Exact Launch fee share sent to the protocol.',
    [LABEL.leftoverProtocol]: 'Protocol share of a buyback pot remaining at graduation.',
    [LABEL.launchBuyback]: 'Quote asset actually spent buying and burning a launched token.',
  },
  ProtocolRevenue: {
    [LABEL.v3Protocol]: 'One third of every pool fee, sent to the Synthra fee recipient (feeProtocol = 3).',
    [LABEL.lockedProtocol]: 'Protocol share of the LP fees earned by launch positions locked at graduation.',
    [LABEL.launchProtocol]: 'Exact Launch fee share sent to the protocol.',
    [LABEL.leftoverProtocol]: 'Protocol share of a buyback pot remaining at graduation.',
  },
  HoldersRevenue: {
    [LABEL.launchBuyback]: 'Quote asset actually spent buying and burning a launched token.',
  },
  SupplySideRevenue: {
    [LABEL.v3Lp]: 'Two thirds of pool fees accruing to liquidity providers, excluding locked launch positions.',
    [LABEL.lockedCreator]: 'Creator share of the LP fees earned by launch positions locked at graduation.',
    [LABEL.launchCreator]: 'Exact Launch fee share sent to the token creator.',
    [LABEL.leftoverCreator]: 'Creator share of a buyback pot remaining at graduation.',
  },
}

const adapter: Adapter = {
  version: 2,
  pullHourly: true,
  fetch,
  adapter: Object.fromEntries(Object.entries(CONFIG).map(([chain, { start }]) => [chain, { start }])),
  methodology,
  breakdownMethodology,
}

export default adapter
