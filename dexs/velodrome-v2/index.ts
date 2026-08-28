import { cache } from "@defillama/sdk"
import { CHAIN } from "../../helpers/chains"
import { FetchOptions, SimpleAdapter } from "../../adapters/types"
import { addOneToken } from "../../helpers/prices"
import { filterPools } from "../../helpers/uniswap"

const swapEvent = 'event Swap(address indexed sender, address indexed to, uint256 amount0In, uint256 amount1In, uint256 amount0Out, uint256 amount1Out)'
const notifyRewardFull = 'event NotifyReward(address indexed from, address indexed reward, uint256 indexed epoch, uint256 amount)'
const opGaugeCreated = 'event GaugeCreated(address indexed poolFactory,address indexed votingRewardsFactory,address indexed gaugeFactory,address pool,address bribeVotingReward,address feeVotingReward,address gauge,address creator)'
const leafGaugeCreated = 'event GaugeCreated(address indexed poolFactory,address indexed votingRewardsFactory,address indexed gaugeFactory,address pool,address incentiveVotingReward,address feeVotingReward,address gauge)'
const getFeeAbi = 'function getFee(address pool, bool _stable) view returns (uint256)'

const OP_FACTORY = '0xF1046053aa5682b4F9a81b5481394DA16BE5FF5a'
const OP_VOTER = '0x41C914ee0c7E1A5edCD0295623e6dC557B5aBf3C'
const LEAF_FACTORY = '0x31832f2a97Fd20664D76Cc421207669b55CE4BC0'
const LEAF_VOTER = '0x97cDBCe21B6fd0585d29E539B1B99dAd328a1123'
const ZERO = '0x0000000000000000000000000000000000000000'

type GaugeCreatedSrc = { voter: string; fromBlock: number; abi: string; bribeField: string }
type ChainCfg = {
  factory: string
  start: string
  maxPairSize?: number
  gaugeCreated?: GaugeCreatedSrc
  badToken?: string
  deadFrom?: string
  }
// Bob/Mode beta gauges are plain Synthetix stakers (no feesVotingReward), so no
// swap fees reach voters. Bob has no leaf Voter — all its fees stay supply-side.

const config: Record<string, ChainCfg> = {
  [CHAIN.OPTIMISM]: {
    factory: OP_FACTORY, start: '2023-06-23', maxPairSize: 500,
    gaugeCreated: { voter: OP_VOTER, fromBlock: 105896852, abi: opGaugeCreated, bribeField: 'bribeVotingReward' },
  },
  [CHAIN.MODE]: {
    factory: LEAF_FACTORY, start: '2024-12-11',
    gaugeCreated: { voter: LEAF_VOTER, fromBlock: 15405187, abi: leafGaugeCreated, bribeField: 'incentiveVotingReward' },
    // ICL (Ironclad) bribe token, unreliable DefiLlama price — dropped so it doesn't inflate bribe revenue.
    badToken: '0x95177295A394f2b9B04545FFf58f4aF0673E839d',
  },
  [CHAIN.BOB]: {
    factory: LEAF_FACTORY, start: '2024-12-11',
  },
  [CHAIN.LISK]: {
    factory: LEAF_FACTORY, start: '2024-12-11',
    gaugeCreated: { voter: LEAF_VOTER, fromBlock: 8339180, abi: leafGaugeCreated, bribeField: 'incentiveVotingReward' },
  },
  [CHAIN.FRAXTAL]: {
    factory: LEAF_FACTORY, start: '2024-12-11',
    gaugeCreated: { voter: LEAF_VOTER, fromBlock: 12603117, abi: leafGaugeCreated, bribeField: 'incentiveVotingReward' },
  },
  [CHAIN.INK]: {
    factory: LEAF_FACTORY, start: '2025-01-15',
    gaugeCreated: { voter: LEAF_VOTER, fromBlock: 3448692, abi: leafGaugeCreated, bribeField: 'incentiveVotingReward' },
  },
  [CHAIN.SONEIUM]: {
    factory: LEAF_FACTORY, start: '2025-01-15',
    gaugeCreated: { voter: LEAF_VOTER, fromBlock: 1906595, abi: leafGaugeCreated, bribeField: 'incentiveVotingReward' },
  },
  [CHAIN.UNICHAIN]: {
    factory: LEAF_FACTORY, start: '2025-02-22',
    gaugeCreated: { voter: LEAF_VOTER, fromBlock: 9387000, abi: leafGaugeCreated, bribeField: 'incentiveVotingReward' },
  },
  [CHAIN.SWELLCHAIN]: {
    factory: LEAF_FACTORY, start: '2025-02-21', deadFrom: '2026-06-30', // swellchain stopped operations
    gaugeCreated: { voter: LEAF_VOTER, fromBlock: 3717934, abi: leafGaugeCreated, bribeField: 'incentiveVotingReward' },
  },
  [CHAIN.CELO]: {
    factory: LEAF_FACTORY, start: '2025-04-01',
    gaugeCreated: { voter: LEAF_VOTER, fromBlock: 31609112, abi: leafGaugeCreated, bribeField: 'incentiveVotingReward' },
  },
}

// Map pool -> gauge(s) for the staked share, and collect external bribes.
const collectGaugesAndBribes = async (options: FetchOptions, cfg: ChainCfg) => {
  const { getLogs, getToBlock, createBalances } = options
  const dailyBribes = createBalances()
  // Set dedupes gauges reported twice (killed then revived).
  const poolToGauges: Record<string, Set<string>> = {}
  if (!cfg.gaugeCreated) return { poolToGauges, dailyBribes }

  const { voter, fromBlock, abi, bribeField } = cfg.gaugeCreated
  const factory = cfg.factory.toLowerCase()
  // Voter is shared with the Slipstream CL factory — keep only this factory's
  // gauges so CL bribes don't leak into v2 fees.
  const gaugeLogs = await getLogs({ target: voter, fromBlock, toBlock: await getToBlock(), eventAbi: abi, cacheInCloud: true })
  const bribeContracts = new Set<string>()
  gaugeLogs.forEach((e: any) => {
    if (e.poolFactory.toLowerCase() !== factory) return
    const gauge = e.gauge.toLowerCase()
    if (gauge !== ZERO) {
      const pool = e.pool.toLowerCase()
        ; (poolToGauges[pool] = poolToGauges[pool] || new Set()).add(gauge)
    }
    if (e[bribeField] !== ZERO) bribeContracts.add(e[bribeField].toLowerCase())
  })
  if (bribeContracts.size > 0) {
    const logs = await getLogs({ targets: [...bribeContracts], eventAbi: notifyRewardFull })
    logs.forEach((e: any) => dailyBribes.add(e.reward, e.amount))
  }

  if (cfg.badToken) dailyBribes.removeTokenBalance(cfg.badToken)
  return { poolToGauges, dailyBribes }
}

const fetch = async (options: FetchOptions) => {
  const { createBalances, getLogs, chain, api } = options
  const cfg = config[chain]
  const factory = cfg.factory.toLowerCase()

  // Pools come from the TVL adapter's cached pair list, same as uniV2Exports.
  const cacheKey = `tvl-adapter-cache/cache/uniswap-forks/${factory}-${chain}.json`
  const { pairs, token0s, token1s } = await cache.readCache(cacheKey, { readFromR2Cache: true })
  if (!pairs?.length) throw new Error('No pairs found, is there a TVL adapter for this?')
  const pairObject: Record<string, string[]> = {}
  pairs.forEach((pair: string, i: number) => { pairObject[pair] = [token0s[i], token1s[i]] })

  const filteredPairs = await filterPools({ api, pairs: pairObject, createBalances, maxPairSize: cfg.maxPairSize ?? 200 })
  const pools = Object.keys(filteredPairs)

  const dailyVolume = createBalances()
  const dailyFees = createBalances()
  const dailyHoldersFees = createBalances()
  const dailySupplySideRevenue = createBalances()

  const { poolToGauges, dailyBribes } = await collectGaugesAndBribes(options, cfg)

  if (pools.length) {
    // per-pool fee tier; getFee is in basis points of 10000
    const stables = await api.multiCall({ abi: 'bool:stable', calls: pools })
    const feeRaw = await api.multiCall({ target: cfg.factory, abi: getFeeAbi, calls: pools.map((p, i) => ({ params: [p, !!stables[i]] })) as any })

    // staked share per pool = sum(pool.balanceOf(gauge)) / pool.totalSupply
    const totalSupplies = await api.multiCall({ abi: 'erc20:totalSupply', calls: pools })
    const balanceCalls: { target: string; params: string[]; pool: string }[] = []
    pools.forEach(pool => (poolToGauges[pool.toLowerCase()] ?? new Set()).forEach(gauge => balanceCalls.push({ target: pool, params: [gauge], pool })))
    const stakedBalances = await api.multiCall({ abi: 'erc20:balanceOf', calls: balanceCalls })
    const stakedByPool: Record<string, number> = {}
    balanceCalls.forEach((c, i) => { stakedByPool[c.pool] = (stakedByPool[c.pool] || 0) + Number(stakedBalances[i]) })
    const stakedShare: Record<string, number> = {}
    pools.forEach((pool, i) => {
      const ts = Number(totalSupplies[i])
      stakedShare[pool] = ts > 0 ? Math.min(1, (stakedByPool[pool] || 0) / ts) : 0
    })

    const allLogs = await getLogs({ targets: pools, eventAbi: swapEvent, flatten: false })
    allLogs.forEach((logs: any[], index: number) => {
      if (!logs.length) return
      const pool = pools[index]
      const [token0, token1] = pairObject[pool]
      const feeRate = Number(feeRaw[index]) / 1e4
      const share = stakedShare[pool]
      logs.forEach((log: any) => {
        const amount0 = Number(log.amount0In) + Number(log.amount0Out)
        const amount1 = Number(log.amount1In) + Number(log.amount1Out)
        addOneToken({ chain, balances: dailyVolume, token0, token1, amount0, amount1 })
        const fee0 = amount0 * feeRate
        const fee1 = amount1 * feeRate
        addOneToken({ chain, balances: dailyFees, token0, token1, amount0: fee0, amount1: fee1 })
        if (share > 0) addOneToken({ chain, balances: dailyHoldersFees, token0, token1, amount0: fee0 * share, amount1: fee1 * share })
        if (share < 1) addOneToken({ chain, balances: dailySupplySideRevenue, token0, token1, amount0: fee0 * (1 - share), amount1: fee1 * (1 - share) })
      })
    })
  }

  const totalFees = createBalances()
  const totalUserFees = createBalances()
  const totalHoldersRevenue = createBalances()
  const totalSupplySide = createBalances()
  totalFees.add(dailyFees, 'Token Swap Fees')
  totalFees.add(dailyBribes, 'External Bribes Rewards')
  // bribes are deposited by third parties, not charged to traders, so they stay out of UserFees
  totalUserFees.add(dailyFees, 'Token Swap Fees')
  totalHoldersRevenue.add(dailyHoldersFees, 'Staked-LP Swap Fees')
  totalHoldersRevenue.add(dailyBribes, 'External Bribes Revenue')
  totalSupplySide.add(dailySupplySideRevenue, 'Unstaked-LP Swap Fees')

  return {
    dailyVolume,
    dailyFees: totalFees,
    dailyUserFees: totalUserFees,
    dailyRevenue: totalHoldersRevenue,
    dailyHoldersRevenue: totalHoldersRevenue,
    dailySupplySideRevenue: totalSupplySide,
  }
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  adapter: config,
  methodology: {
    Volume: 'Swap volume across Velodrome v2 (non-CL) pools, counted once per swap from the core-asset side.',
    Fees: 'Per-pool swap fee read from PoolFactory.getFee (default vAMM 0.30% / sAMM 0.05%, customizable per pool) applied to each swap, plus external bribes deposited by third parties to voter-incentive contracts.',
    UserFees: 'Swap fees paid by traders only. External bribes are deposited by third parties to influence votes, so they are excluded here even though they count towards Fees.',
    Revenue: 'veVELO voters’ take: staked-LP swap fees forwarded to voters plus external bribes. Equals HoldersRevenue — Velodrome keeps no treasury cut of swap fees.',
    HoldersRevenue: 'Swap fees from staked LPs (fee × pool.balanceOf(gauge) / pool.totalSupply), forwarded to veVELO voters, plus external bribes.',
    SupplySideRevenue: 'Swap fees kept by unstaked LPs (fee × (1 − stakedShare)). LPs who stake in the gauge forgo these fees in exchange for VELO emissions.',
  },
  breakdownMethodology: {
    Fees: {
      'Token Swap Fees': 'Swap fees paid by traders, per-pool rate from PoolFactory.getFee applied to each swap amount.',
      'External Bribes Rewards': 'External incentives deposited by third parties to the voter bribe/incentive contracts (NotifyReward events).',
    },
    UserFees: {
      'Token Swap Fees': 'Swap fees paid by traders, per-pool rate from PoolFactory.getFee applied to each swap amount.',
    },
    Revenue: {
      'Staked-LP Swap Fees': 'Staked-LP share of swap fees, forwarded to veVELO voters.',
      'External Bribes Revenue': 'External incentives deposited by third parties, claimable by veVELO voters.',
    },
    HoldersRevenue: {
      'Staked-LP Swap Fees': 'Staked-LP share of swap fees, forwarded to veVELO voters.',
      'External Bribes Revenue': 'External incentives deposited by third parties, claimable by veVELO voters.',
    },
    SupplySideRevenue: {
      'Unstaked-LP Swap Fees': 'Unstaked-LP share of swap fees, claimable directly from the pool.',
    },
  },
}

export default adapter
