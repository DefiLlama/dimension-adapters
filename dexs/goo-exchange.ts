import { cache } from '@defillama/sdk';
import { ethers } from 'ethers';
import { FetchOptions, SimpleAdapter } from '../adapters/types';
import { CHAIN } from '../helpers/chains';
import { METRIC } from '../helpers/metrics';
import { addOneToken } from '../helpers/prices';
import { filterPools } from '../helpers/uniswap';

// goo exchange (https://goo.exchange/docs/): stock uniV3 pools, CREATE2'd by a separate pool deployer; PoolCreated is emitted by the factory.
// Every pool has had slot0().feeProtocol = 68 since launch (1/4 of the swap fee on both sides). The owner can retune it per pool
// (0 or 1/4-1/10), so it is read from each pool. The protocol fee is split 50/50: half to a fee jar that auctions it for GOO and
// burns the GOO, half to a development fund.
// Much of the liquidity is protocol-owned: positions held by the protocol's own contracts earn the LP part of the fee for the
// protocol, so that part is revenue, not a cost. It is measured per position from the pool's fee growth over the window.
const FACTORY = '0x221A6239E40709792b0d4bdc140fA36158CD41C7'
const POSITION_MANAGER = '0xdc504c2DE9C26846AfdAC56385673B039c2e27cb'
const PROTOCOL_OWNERS = [
  '0x90E440da768C7Fa8a6A71c7A7C1270e069C92887', // POL vault: owned by the treasury Safe, withdraws only to it
  '0x7Ff08E6bF203c99CAC450773b3424c6b683Ad011', // pilot POL vault: owned by the treasury Safe, withdraws only to it
  '0xB50f029A7004f87B13CBCefb7f21c0A91CbD1bA0', // treasury Safe
]
const Q128 = 1n << 128n
const MOD = 1n << 256n

const GOO_BURN_LABEL = 'Swap Fees To GOO Buyback And Burn'
const GOO_DEV_FUND_LABEL = 'Swap Fees To Development Fund'
const GOO_LP_LABEL = 'Swap Fees To LPs'
const GOO_POL_LABEL = 'Swap Fees To Protocol-Owned Liquidity'

const abi = {
  poolCreated: 'event PoolCreated(address indexed token0, address indexed token1, uint24 indexed fee, int24 tickSpacing, address pool)',
  swap: 'event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)',
  slot0: 'function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)',
  feeGrowthGlobal0: 'function feeGrowthGlobal0X128() view returns (uint256)',
  feeGrowthGlobal1: 'function feeGrowthGlobal1X128() view returns (uint256)',
  ticks: 'function ticks(int24) view returns (uint128 liquidityGross, int128 liquidityNet, uint256 feeGrowthOutside0X128, uint256 feeGrowthOutside1X128, int56 tickCumulativeOutside, uint160 secondsPerLiquidityOutsideX128, uint32 secondsOutside, bool initialized)',
  balanceOf: 'function balanceOf(address) view returns (uint256)',
  tokenOfOwnerByIndex: 'function tokenOfOwnerByIndex(address, uint256) view returns (uint256)',
  positions: 'function positions(uint256) view returns (uint96 nonce, address operator, address token0, address token1, uint24 fee, int24 tickLower, int24 tickUpper, uint128 liquidity, uint256 feeGrowthInside0LastX128, uint256 feeGrowthInside1LastX128, uint128 tokensOwed0, uint128 tokensOwed1)',
}

type Pool = { token0: string, token1: string, fee: bigint }
const poolKey = (token0: string, token1: string, fee: any) => `${token0.toLowerCase()}-${token1.toLowerCase()}-${fee}`
const wrap = (x: bigint) => ((x % MOD) + MOD) % MOD

// The pools, from the TVL adapter's PoolCreated log cache, as the shared uniV3 helper reads them
async function getPools(chain: string): Promise<Record<string, Pool>> {
  const { logs } = await cache.readCache(`tvl-adapter-cache/cache/logs/${chain}/${FACTORY.toLowerCase()}.json`, { readFromR2Cache: true })
  if (!logs?.length) throw new Error('goo-exchange: no pools in the TVL adapter log cache')
  const iface = new ethers.Interface([abi.poolCreated])
  const pools: Record<string, Pool> = {}
  for (const log of logs) {
    const args = iface.parseLog(log)?.args
    if (args) pools[args.pool.toLowerCase()] = { token0: args.token0.toLowerCase(), token1: args.token1.toLowerCase(), fee: BigInt(args.fee) }
  }
  return pools
}

// LP fees earned over the window by the positions the protocol's own contracts hold, per pool and token: liquidity times
// the growth of the fee per unit of liquidity inside the position's range, from the window's first block to its last.
async function getProtocolOwnedLpFees(options: FetchOptions, pools: Record<string, Pool>, counted: Set<string>) {
  const { api, fromApi } = options
  const poolByKey: Record<string, string> = {}
  for (const [pool, { token0, token1, fee }] of Object.entries(pools)) poolByKey[poolKey(token0, token1, fee)] = pool

  const balances = await api.multiCall({ target: POSITION_MANAGER, abi: abi.balanceOf, calls: PROTOCOL_OWNERS })
  const ownerIndexes = PROTOCOL_OWNERS.flatMap((owner, i) => Array.from({ length: Number(balances[i]) }, (_, j) => ({ params: [owner, j] })))
  const owed: Record<string, [bigint, bigint]> = {}
  if (!ownerIndexes.length) return owed
  const tokenIds = await api.multiCall({ target: POSITION_MANAGER, abi: abi.tokenOfOwnerByIndex, calls: ownerIndexes })
  const [positionsTo, positionsFrom] = await Promise.all([
    api.multiCall({ target: POSITION_MANAGER, abi: abi.positions, calls: tokenIds }),
    // a position minted during the window doesn't exist at its start
    fromApi.multiCall({ target: POSITION_MANAGER, abi: abi.positions, calls: tokenIds, permitFailure: true }),
  ])

  // a position counts only when it held liquidity through the window: a younger one's ticks may not exist at the start
  const live = positionsTo
    .map((position: any, i: number) => {
      const to = BigInt(position.liquidity)
      const from = BigInt(positionsFrom[i]?.liquidity ?? 0)
      return {
        pool: poolByKey[poolKey(position.token0, position.token1, position.fee)],
        tickLower: Number(position.tickLower),
        tickUpper: Number(position.tickUpper),
        liquidity: to < from ? to : from,
      }
    })
    .filter((p: any) => p.pool && counted.has(p.pool) && p.liquidity > 0n)
  if (!live.length) return owed

  const insideAt = async (chainApi: any) => {
    const targets = live.map((p: any) => p.pool)
    const [slot0s, global0s, global1s, lowers, uppers] = await Promise.all([
      chainApi.multiCall({ abi: abi.slot0, calls: targets }),
      chainApi.multiCall({ abi: abi.feeGrowthGlobal0, calls: targets }),
      chainApi.multiCall({ abi: abi.feeGrowthGlobal1, calls: targets }),
      chainApi.multiCall({ abi: abi.ticks, calls: live.map((p: any) => ({ target: p.pool, params: [p.tickLower] })) }),
      chainApi.multiCall({ abi: abi.ticks, calls: live.map((p: any) => ({ target: p.pool, params: [p.tickUpper] })) }),
    ])
    return live.map((p: any, i: number) => {
      const tick = Number(slot0s[i].tick)
      const inside = (global: any, field: string) => {
        const g = BigInt(global)
        const outsideLower = BigInt(lowers[i][field])
        const outsideUpper = BigInt(uppers[i][field])
        const below = tick >= p.tickLower ? outsideLower : g - outsideLower
        const above = tick < p.tickUpper ? outsideUpper : g - outsideUpper
        return wrap(g - below - above)
      }
      return [inside(global0s[i], 'feeGrowthOutside0X128'), inside(global1s[i], 'feeGrowthOutside1X128')]
    })
  }
  const [insideFrom, insideTo] = await Promise.all([insideAt(fromApi), insideAt(api)])
  live.forEach((p: any, i: number) => {
    const sum = owed[p.pool] ?? [0n, 0n]
    owed[p.pool] = [0, 1].map((t) => sum[t] + (p.liquidity * wrap(insideTo[i][t] - insideFrom[i][t])) / Q128) as [bigint, bigint]
  })
  return owed
}

const fetch = async (options: FetchOptions) => {
  const { api, chain, createBalances, getLogs } = options
  const dailyVolume = createBalances()
  const dailyFees = createBalances()
  const dailySupplySideRevenue = createBalances()
  const dailyRevenue = createBalances()
  const dailyHoldersRevenue = createBalances()
  const dailyProtocolRevenue = createBalances()
  const result = () => ({ dailyVolume, dailyFees, dailyUserFees: dailyFees.clone(1), dailySupplySideRevenue, dailyRevenue, dailyProtocolRevenue, dailyHoldersRevenue })

  const pools = await getPools(chain)
  // the same wash-trading guard the shared uniV3 helper applies: pools with too little priced liquidity are left out
  const pairs = Object.fromEntries(Object.entries(pools).map(([pool, p]) => [pool, [p.token0, p.token1]]))
  const counted = Object.keys(await filterPools({ api, pairs, createBalances }))
  if (!counted.length) return result()

  const slot0s = await api.multiCall({ abi: abi.slot0, calls: counted })
  const [swaps, owned] = await Promise.all([
    getLogs({ targets: counted, eventAbi: abi.swap, flatten: false }),
    getProtocolOwnedLpFees(options, pools, new Set(counted)),
  ])

  counted.forEach((pool, i) => {
    const { token0, token1, fee } = pools[pool]
    // Both sides are set in one call and have always been equal; an unequal pair fails rather than guess which side a fee used
    const feeProtocol = Number(slot0s[i].feeProtocol)
    if ((feeProtocol & 0x0f) !== (feeProtocol >> 4)) throw new Error(`goo-exchange: asymmetric protocol fee in ${pool}`)
    const protocolDenominator = BigInt(feeProtocol & 0x0f)

    const lp: [bigint, bigint] = [0n, 0n]
    for (const { amount0, amount1 } of swaps[i]) {
      const amounts = [BigInt(amount0), BigInt(amount1)]
      addOneToken({ chain, balances: dailyVolume, token0, token1, amount0: amounts[0], amount1: amounts[1] })
      // the swap fee is charged on the input token: the side the pool received
      const side = amounts[0] > 0n ? 0 : 1
      if (amounts[side] <= 0n) continue
      const token = side === 0 ? token0 : token1
      const swapFee = (amounts[side] * fee) / 1_000_000n
      const protocolFee = protocolDenominator > 0n ? swapFee / protocolDenominator : 0n
      const toJar = protocolFee / 2n
      dailyFees.add(token, swapFee, METRIC.SWAP_FEES)
      dailyRevenue.add(token, toJar, GOO_BURN_LABEL)
      dailyHoldersRevenue.add(token, toJar, GOO_BURN_LABEL)
      dailyRevenue.add(token, protocolFee - toJar, GOO_DEV_FUND_LABEL)
      dailyProtocolRevenue.add(token, protocolFee - toJar, GOO_DEV_FUND_LABEL)
      lp[side] += swapFee - protocolFee
    }

    // the protocol's positions can't earn more of a token than the pool's LPs did: rounding and mid-window changes are capped
    const own = owned[pool] ?? [0n, 0n]
    ;[token0, token1].forEach((token, t) => {
      const toProtocol = own[t] < lp[t] ? own[t] : lp[t]
      dailyRevenue.add(token, toProtocol, GOO_POL_LABEL)
      dailyProtocolRevenue.add(token, toProtocol, GOO_POL_LABEL)
      dailySupplySideRevenue.add(token, lp[t] - toProtocol, GOO_LP_LABEL)
    })
  })

  return result()
}

const methodology = {
  Volume: "Total swap volume on goo exchange pools.",
  Fees: "Swap fees paid by users at each pool's fee tier, in the token each swap paid in.",
  UserFees: "Swap fees paid by users at each pool's fee tier, in the token each swap paid in.",
  Revenue: "The protocol fee (each pool's share of the swap fee, read from the pool: 1/4 on every pool since launch), plus the LP fees earned by protocol-owned liquidity.",
  ProtocolRevenue: "Half of the protocol fee, paid to the development fund, plus the LP fees earned by the protocol's own positions (its POL vaults and treasury Safe).",
  HoldersRevenue: "Half of the protocol fee, sent to a fee jar that auctions it for GOO and burns the GOO.",
  SupplySideRevenue: "Swap fees less the protocol fee, earned by outside liquidity providers.",
}

const breakdownMethodology = {
  Fees: { [METRIC.SWAP_FEES]: methodology.Fees },
  UserFees: { [METRIC.SWAP_FEES]: methodology.UserFees },
  Revenue: {
    [GOO_BURN_LABEL]: 'Half of the protocol fee, sent to a fee jar that auctions it for GOO and burns the GOO.',
    [GOO_DEV_FUND_LABEL]: 'Half of the protocol fee, paid to the development fund.',
    [GOO_POL_LABEL]: 'LP fees earned by the protocol\'s own positions: liquidity times the fee growth inside each position\'s range over the period.',
  },
  ProtocolRevenue: {
    [GOO_DEV_FUND_LABEL]: 'Half of the protocol fee, paid to the development fund.',
    [GOO_POL_LABEL]: 'LP fees earned by positions held by the protocol\'s POL vaults and treasury Safe.',
  },
  HoldersRevenue: { [GOO_BURN_LABEL]: methodology.HoldersRevenue },
  SupplySideRevenue: { [GOO_LP_LABEL]: methodology.SupplySideRevenue },
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  adapter: {
    [CHAIN.ROBINHOOD]: {
      fetch,
      start: '2026-09-26',
    },
  },
  methodology,
  breakdownMethodology,
}

export default adapter;
