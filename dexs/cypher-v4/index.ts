import { FetchOptions, SimpleAdapter } from '../../adapters/types'
import { CHAIN } from '../../helpers/chains'
import { addOneToken } from '../../helpers/prices'
import { filterPools } from '../../helpers/uniswap'

// Cypher "v4" is an Algebra Integral fork (Cypher's own label, not Uniswap v4). Moved off the Cypher subgraph, which
// overstated USD volume in the thin WETH/USDT pool
const FACTORY = '0xfb8Ed3485EfA29a0e4bed93351dD51B59fC4b0f0'
// block of the factory's first Pool event (WETH/USDT pool, 2025-11-06)
const FIRST_POOL_BLOCK = 23740567
const FEE_DENOMINATOR = 1e6
const COMMUNITY_FEE_DENOMINATOR = 1e3
const COMMUNITY_VAULT = '0x85D63DC01cF69AC44580444A640250d50e63f9Df'
const ALGEBRA_FEE_DENOMINATOR = 1e3

const poolCreatedEvent = 'event Pool(address indexed token0, address indexed token1, address pool)'
const swapEvent = 'event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 price, uint128 liquidity, int24 tick, uint24 overrideFee, uint24 pluginFee)'
const globalStateAbi = 'function globalState() view returns (uint160 price, int24 tick, uint16 lastFee, uint8 pluginConfig, uint16 communityFee, bool unlocked)'

const fetch = async (options: FetchOptions) => {
  const { api, chain, createBalances, getLogs } = options
  const dailyVolume = createBalances()
  const dailyFees = createBalances()
  const dailyRevenue = createBalances()
  const dailySupplySideRevenue = createBalances()

  const poolLogs = await getLogs({ target: FACTORY, eventAbi: poolCreatedEvent, fromBlock: FIRST_POOL_BLOCK, toBlock: await options.getToBlock(), cacheInCloud: true })
  const pairs: Record<string, string[]> = {}
  poolLogs.forEach((log: any) => { pairs[log.pool.toLowerCase()] = [log.token0, log.token1] })
  const pools = Object.keys(await filterPools({ api, pairs, createBalances }))

  if (pools.length) {
    const states = await api.multiCall({ abi: globalStateAbi, calls: pools })
    const algebraShare = Number(await api.call({ target: COMMUNITY_VAULT, abi: 'function algebraFee() view returns (uint16)' })) / ALGEBRA_FEE_DENOMINATOR
    const poolState: Record<string, any> = {}
    pools.forEach((pool, i) => { poolState[pool] = states[i] })
    const swapLogs = await getLogs({ targets: pools, eventAbi: swapEvent, onlyArgs: false })

    for (const { address, args: log } of swapLogs) {
      const pool = address.toLowerCase()
      const [token0, token1] = pairs[pool]
      const communityShare = Number(poolState[pool].communityFee) / COMMUNITY_FEE_DENOMINATOR
      if (Number(log.pluginFee) !== 0) throw new Error(`cypher-v4: non-zero pluginFee on pool ${pool}, fee split needs review`)
      const feeRate = (Number(log.overrideFee) || Number(poolState[pool].lastFee)) / FEE_DENOMINATOR
      addOneToken({ chain, balances: dailyVolume, token0, token1, amount0: log.amount0, amount1: log.amount1 })
      const { token, amount } = addOneToken({ chain, balances: dailyFees, token0, token1, amount0: Number(log.amount0) * feeRate, amount1: Number(log.amount1) * feeRate, label: 'Swap Fees' })
      const communityFee = amount * communityShare
      dailyRevenue.add(token, communityFee * (1 - algebraShare), 'Swap Fees To Protocol')
      dailySupplySideRevenue.add(token, communityFee * algebraShare, 'Swap Fees To Algebra')
      dailySupplySideRevenue.add(token, amount - communityFee, 'Swap Fees To LPs')
    }
  }

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  }
}

const methodology = {
  Volume: 'Swap volume across the Cypher V4 (Algebra Integral) pools created by the Cypher factory on Ethereum, excluding pools launched through third-party custom deployers.',
  Fees: "Swap fees paid by traders, at the fee each pool charged on the trade, which Cypher's fee plugins set per swap.",
  UserFees: 'Traders pay all swap fees.',
  Revenue: "Cypher's part of the swap fees: each pool's on-chain community fee (currently 20% of swap fees) minus Algebra's licence fee (currently 10% of it), so 18% of swap fees.",
  ProtocolRevenue: 'Cypher\'s part of the swap fees.',
  SupplySideRevenue: 'Swap fees paid to liquidity providers (currently 80%) and to Algebra as its licence fee (currently 2%).',
}

const breakdownMethodology = {
  Fees: { 'Swap Fees': 'Swap fees paid by traders, at the fee each pool charged on the trade.' },
  UserFees: { 'Swap Fees': 'Swap fees paid by traders, at the fee each pool charged on the trade.' },
  Revenue: { 'Swap Fees To Protocol': "Each pool's on-chain community fee share of swap fees, after Algebra's licence fee, sent to the Cypher treasury." },
  ProtocolRevenue: { 'Swap Fees To Protocol': "Each pool's on-chain community fee share of swap fees, after Algebra's licence fee, sent to the Cypher treasury." },
  SupplySideRevenue: {
    'Swap Fees To LPs': 'Swap fees left after the community fee, earned by liquidity providers.',
    'Swap Fees To Algebra': "Algebra's licence fee, its share of the community fee set in the community vault (currently 10% of it).",
  },
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ETHEREUM],
  start: '2025-11-22',
  methodology,
  breakdownMethodology,
}

export default adapter
