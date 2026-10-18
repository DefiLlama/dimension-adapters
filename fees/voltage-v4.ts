import { FetchOptions, SimpleAdapter } from '../adapters/types'
import { CHAIN } from '../helpers/chains'
import { addOneToken } from '../helpers/prices'
import { filterPools } from '../helpers/uniswap'

const FACTORY = '0xccEdb990abBf0606Cf47e7C6A26e419931c7dc1F'
const FIRST_POOL_BLOCK = 32731457

const COMMUNITY_VAULT = '0x410698C399A0DB5D9dFbE31f22E53b479DF0Ee7E'
const FEE_DENOMINATOR = 1e6
const COMMUNITY_FEE_DENOMINATOR = 1e3
const ALGEBRA_FEE_DENOMINATOR = 1e3

const poolCreatedEvent = 'event Pool(address indexed token0, address indexed token1, address pool)'
const swapEvent = 'event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 price, uint128 liquidity, int24 tick, uint24 overrideFee, uint24 pluginFee)'
const globalStateAbi = 'function globalState() view returns (uint160 price, int24 tick, uint16 lastFee, uint8 pluginConfig, uint16 communityFee, bool unlocked)'

const fetch = async (options: FetchOptions) => {
  const { api, chain, createBalances, getLogs } = options
  const dailyFees = createBalances()
  const dailyRevenue = createBalances()
  const dailySupplySideRevenue = createBalances()

  const poolLogs = await getLogs({ target: FACTORY, eventAbi: poolCreatedEvent, fromBlock: FIRST_POOL_BLOCK, toBlock: await options.getToBlock(), cacheInCloud: true })
  const pairs: Record<string, string[]> = {}
  poolLogs.forEach((log: any) => { pairs[log.pool.toLowerCase()] = [log.token0, log.token1] })
  const pools = Object.keys(await filterPools({ api, pairs, createBalances }))

  if (pools.length) {
    const feeRates = await api.multiCall({ abi: 'function fee() view returns (uint24)', calls: pools })
    const states = await api.multiCall({ abi: globalStateAbi, calls: pools })
    const algebraShare = Number(await api.call({ target: COMMUNITY_VAULT, abi: 'function algebraFee() view returns (uint16)' })) / ALGEBRA_FEE_DENOMINATOR
    const poolInfo: Record<string, { feeRate: number, communityShare: number }> = {}
    pools.forEach((pool, i) => {
      poolInfo[pool] = { feeRate: Number(feeRates[i]) / FEE_DENOMINATOR, communityShare: Number(states[i].communityFee) / COMMUNITY_FEE_DENOMINATOR }
    })
    const swapLogs = await getLogs({ targets: pools, eventAbi: swapEvent, onlyArgs: false })

    for (const { address, args: log } of swapLogs) {
      const pool = address.toLowerCase()
      const [token0, token1] = pairs[pool]
      const { feeRate, communityShare } = poolInfo[pool]
      if (Number(log.pluginFee) !== 0) throw new Error(`voltage-v4: non-zero pluginFee on pool ${pool}, fee split needs review`)
      const swapFeeRate = Number(log.overrideFee) ? Number(log.overrideFee) / FEE_DENOMINATOR : feeRate
      const { token, amount } = addOneToken({ chain, balances: dailyFees, token0, token1, amount0: Number(log.amount0) * swapFeeRate, amount1: Number(log.amount1) * swapFeeRate, label: 'Token Swap Fees' })
      const communityFee = amount * communityShare
      dailyRevenue.add(token, communityFee * (1 - algebraShare), 'Swap Fees To Voltage')
      dailySupplySideRevenue.add(token, communityFee * algebraShare, 'Swap Fees To Algebra')
      dailySupplySideRevenue.add(token, amount - communityFee, 'Swap Fees To LPs')
    }
  }

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue.clone(),
    dailySupplySideRevenue,
    dailyHoldersRevenue: 0,
  }
}

const methodology = {
  Fees: "Swap fees paid by traders on Voltage V4 pools, at each pool's dynamic fee rate read once per hour.",
  Revenue: "Voltage's part of the swap fees: each pool's on-chain community fee minus Algebra's licence fee, which took all of the community fee until 22 July 2025 and 25% of it since.",
  ProtocolRevenue: "Voltage's part of the swap fees: each pool's on-chain community fee minus Algebra's licence fee, which took all of the community fee until 22 July 2025 and 25% of it since.",
  SupplySideRevenue: "Swap fees earned by liquidity providers, plus Algebra's licence fee taken from the pool community fee.",
  HoldersRevenue: 'No swap fees are currently distributed to VOLT holders.',
}

const breakdownMethodology = {
  Fees: { 'Token Swap Fees': "Swap fees paid by traders, at each pool's dynamic fee rate." },
  Revenue: { 'Swap Fees To Voltage': "Each pool's community fee share of swap fees, after Algebra's licence fee." },
  ProtocolRevenue: { 'Swap Fees To Voltage': "Each pool's community fee share of swap fees, after Algebra's licence fee." },
  SupplySideRevenue: {
    'Swap Fees To LPs': 'Swap fees left after the pool community fee, earned by liquidity providers.',
    'Swap Fees To Algebra': "Algebra's licence fee, its share of the community fee set in the Voltage community vault: all of it until 22 July 2025, 25% since.",
  },
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.FUSE],
  start: '2024-11-19',
  methodology,
  breakdownMethodology,
}

export default adapter
