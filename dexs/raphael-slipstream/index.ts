import { cache } from "@defillama/sdk"
import { CHAIN } from "../../helpers/chains"
import { FetchOptions, SimpleAdapter } from "../../adapters/types"
import { addOneToken } from "../../helpers/prices"
import { filterPools } from "../../helpers/uniswap"

const poolCreatedEvent = 'event PoolCreated(address indexed token0, address indexed token1, int24 indexed tickSpacing, address pool)'
const swapEvent = 'event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)'
const gaugeCreatedEvent = 'event GaugeCreated(address indexed poolFactory,address indexed votingRewardsFactory,address indexed gaugeFactory,address pool,address bribeVotingReward,address feeVotingReward,address gauge,address creator)'
const notifyRewardFull = 'event NotifyReward(address indexed from, address indexed reward, uint256 indexed epoch, uint256 amount)'

// Raphael Exchange Slipstream (Aerodrome/Velodrome-v2 CL fork) on Robinhood Chain.
// The CL pool exposes both the Aerodrome-CL style gaugeFees() accumulator and the
// Velodrome-CL style liquidity()/stakedLiquidity()/unstakedFee() snapshot fields;
// this adapter uses the latter (simpler, no accumulator-delta/drain tracking).
const CL_FACTORY = '0x5481864ddd46a2D798Df0925C23B7846e776E5E3'
const CL_GAUGE_FACTORY = '0xD75e0c050FD32469DB14Cf6d3897e22825cD23E1'
const RAPH_VOTER = '0x81024323a84Ae2DCaCee4E1d4087Cc2fb424fb27'
const CL_DEPLOY_BLOCK = 54367028
const ZERO = '0x0000000000000000000000000000000000000000'

type ChainCfg = {
  factory: string
  start: string
  maxPairSize?: number
  gaugeFromBlock: number
}

const config: Record<string, ChainCfg> = {
  [CHAIN.ROBINHOOD]: {
    factory: CL_FACTORY, start: '2026-09-04', gaugeFromBlock: CL_DEPLOY_BLOCK,
  },
}

// Map pool -> gauge(s), and collect external bribes. Same shape as dexs/raphael,
// just pointed at the CL factory/gauge-factory pair.
const collectGaugesAndBribes = async (options: FetchOptions, cfg: ChainCfg) => {
  const { getLogs, getToBlock, createBalances } = options
  const dailyBribes = createBalances()
  const poolToGauges: Record<string, Set<string>> = {}

  const factory = cfg.factory.toLowerCase()
  const gaugeLogs = await getLogs({ target: RAPH_VOTER, fromBlock: cfg.gaugeFromBlock, toBlock: await getToBlock(), eventAbi: gaugeCreatedEvent, cacheInCloud: true })
  const bribeContracts = new Set<string>()
  gaugeLogs.forEach((e: any) => {
    if (e.poolFactory.toLowerCase() !== factory) return
    if (e.gaugeFactory.toLowerCase() !== CL_GAUGE_FACTORY.toLowerCase()) return
    const gauge = e.gauge.toLowerCase()
    if (gauge !== ZERO) {
      const pool = e.pool.toLowerCase()
        ; (poolToGauges[pool] = poolToGauges[pool] || new Set()).add(gauge)
    }
    if (e.bribeVotingReward !== ZERO) bribeContracts.add(e.bribeVotingReward.toLowerCase())
  })
  if (bribeContracts.size > 0) {
    const logs = await getLogs({ targets: [...bribeContracts], eventAbi: notifyRewardFull })
    logs.forEach((e: any) => dailyBribes.add(e.reward, e.amount))
  }

  return { poolToGauges, dailyBribes }
}

const fetch = async (options: FetchOptions) => {
  const { createBalances, getLogs, chain, api } = options
  const cfg = config[chain]
  const factory = cfg.factory.toLowerCase()

  // No Raphael Slipstream TVL adapter yet, so fall back to enumerating pools
  // straight from the CL PoolFactory (allPoolsLength/allPools, same as the v2 adapter).
  const cacheKey = `tvl-adapter-cache/cache/uniswap-forks/${factory}-${chain}.json`
  let { pairs, token0s, token1s } = await cache.readCache(cacheKey, { readFromR2Cache: true })
  if (!pairs?.length) {
    pairs = await api.fetchList({ lengthAbi: 'uint256:allPoolsLength', itemAbi: 'function allPools(uint256) view returns (address)', target: cfg.factory })
    ;[token0s, token1s] = await Promise.all([
      api.multiCall({ abi: 'address:token0', calls: pairs }),
      api.multiCall({ abi: 'address:token1', calls: pairs }),
    ])
  }
  if (!pairs?.length) throw new Error('No pools found for Raphael Slipstream')
  const pairObject: Record<string, string[]> = {}
  pairs.forEach((pair: string, i: number) => { pairObject[pair] = [token0s[i], token1s[i]] })

  const filteredPairs = await filterPools({ api, pairs: pairObject, createBalances, maxPairSize: cfg.maxPairSize ?? 200 })
  const pools = Object.keys(filteredPairs)

  const dailyVolume = createBalances()
  const dailyFees = createBalances()
  const dailyHoldersFees = createBalances()
  const dailySupplySideRevenue = createBalances()

  const { dailyBribes } = await collectGaugesAndBribes(options, cfg)

  if (pools.length) {
    const [feeRaw, liquidity, stakedLiquidity, unstakedFeeRaw] = await Promise.all([
      api.multiCall({ abi: 'function fee() view returns (uint24)', calls: pools }),
      api.multiCall({ abi: 'function liquidity() view returns (uint128)', calls: pools }),
      api.multiCall({ abi: 'function stakedLiquidity() view returns (uint128)', calls: pools }),
      api.multiCall({ abi: 'function unstakedFee() view returns (uint24)', calls: pools }),
    ])

    // per-pool holders share = stakedShare + (1 - stakedShare) * unstakedFee rake,
    // i.e. staked-LP fees plus the unstaked-LP rake, both routed to the gauge.
    const holdersShare: Record<string, number> = {}
    pools.forEach((pool, i) => {
      const activeLiquidity = Number(liquidity[i])
      const staked = Math.min(Number(stakedLiquidity[i]), activeLiquidity)
      const stakedShare = activeLiquidity > 0 ? staked / activeLiquidity : 0
      const rake = Number(unstakedFeeRaw[i]) / 1e6
      holdersShare[pool] = stakedShare + (1 - stakedShare) * rake
    })

    // per-pool, per-token input-side fee accumulators. CL fees are taken on the
    // input side only: amount0/amount1 > 0 means that token flowed into the pool.
    const poolFeeTotals: Record<string, { fee0: number; fee1: number }> = {}

    const allLogs = await getLogs({ targets: pools, eventAbi: swapEvent, flatten: false })
    allLogs.forEach((logs: any[], index: number) => {
      if (!logs.length) return
      const pool = pools[index]
      const [token0, token1] = pairObject[pool]
      const feeRate = Number(feeRaw[index]) / 1e6
      if (!poolFeeTotals[pool]) poolFeeTotals[pool] = { fee0: 0, fee1: 0 }
      logs.forEach((log: any) => {
        const amount0 = Number(log.amount0)
        const amount1 = Number(log.amount1)
        addOneToken({ chain, balances: dailyVolume, token0, token1, amount0, amount1 })
        if (amount0 > 0) poolFeeTotals[pool].fee0 += amount0 * feeRate
        if (amount1 > 0) poolFeeTotals[pool].fee1 += amount1 * feeRate
      })
    })

    // Roll up per-pool totals: fee0/fee1 are independent contributions (whichever
    // token was the input on a given swap), so both sides get priced and added.
    pools.forEach(pool => {
      const totals = poolFeeTotals[pool]
      if (!totals || (totals.fee0 === 0 && totals.fee1 === 0)) return
      const [token0, token1] = pairObject[pool]
      const share = holdersShare[pool]
      if (totals.fee0 > 0) {
        dailyFees.add(token0, totals.fee0, 'Token Swap Fees')
        dailyHoldersFees.add(token0, totals.fee0 * share, 'Staked-LP Swap Fees')
        dailySupplySideRevenue.add(token0, totals.fee0 * (1 - share), 'Unstaked-LP Swap Fees')
      }
      if (totals.fee1 > 0) {
        dailyFees.add(token1, totals.fee1, 'Token Swap Fees')
        dailyHoldersFees.add(token1, totals.fee1 * share, 'Staked-LP Swap Fees')
        dailySupplySideRevenue.add(token1, totals.fee1 * (1 - share), 'Unstaked-LP Swap Fees')
      }
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
    Volume: 'Swap volume across Raphael Exchange Slipstream (CL) pools, counted once per swap from the core-asset side.',
    Fees: "Total swap fees paid by traders. Per-pool fee rate read from CLPool.fee() applied to each swap's input amount.",
    UserFees: 'Swap fees paid by traders only. External bribes are deposited by third parties to influence votes, so they are excluded here even though they count towards Fees.',
    Revenue: 'veRAPH voters’ take: staked-LP swap fees plus the unstaked-LP rake (CLPool.unstakedFee), plus external bribes. Equals HoldersRevenue — Raphael keeps no treasury cut of swap fees.',
    HoldersRevenue: 'Fees earned by staked liquidity (CLPool.stakedLiquidity / liquidity) plus the rake taken from unstaked liquidity, forwarded to veRAPH voters, plus external bribes.',
    SupplySideRevenue: 'Swap fees kept by unstaked liquidity providers, net of the unstaked-LP rake.',
  },
  breakdownMethodology: {
    Fees: {
      'Token Swap Fees': 'Swap fees paid by traders, per-pool rate from CLPool.fee() applied to each swap\'s input amount.',
      'External Bribes Rewards': 'External incentives deposited by third parties to the voter bribe/incentive contracts (NotifyReward events).',
    },
    UserFees: {
      'Token Swap Fees': 'Swap fees paid by traders, per-pool rate from CLPool.fee() applied to each swap\'s input amount.',
    },
    Revenue: {
      'Staked-LP Swap Fees': 'Fees earned by staked liquidity plus the unstaked-LP rake, forwarded to veRAPH voters.',
      'External Bribes Revenue': 'External incentives deposited by third parties, claimable by veRAPH voters.',
    },
    HoldersRevenue: {
      'Staked-LP Swap Fees': 'Fees earned by staked liquidity plus the unstaked-LP rake, forwarded to veRAPH voters.',
      'External Bribes Revenue': 'External incentives deposited by third parties, claimable by veRAPH voters.',
    },
    SupplySideRevenue: {
      'Unstaked-LP Swap Fees': 'Unstaked liquidity providers\' share of swap fees, net of the unstaked-LP rake redirected to the gauge.',
    },
  },
}

export default adapter
