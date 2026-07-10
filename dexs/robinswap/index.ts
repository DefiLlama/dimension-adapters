import { FetchOptions, SimpleAdapter } from '../../adapters/types'
import { CHAIN } from '../../helpers/chains'
import { getUniV2LogAdapter, getUniV3LogAdapter } from '../../helpers/uniswap'

// RobinSwap V2 factory: https://robinhoodchain.blockscout.com/address/0xa95DA9b9fCef09A07F99444fE9304457d6ECdccA
const V2_FACTORY = '0xa95DA9b9fCef09A07F99444fE9304457d6ECdccA'
// RobinSwap V3 factory: https://robinhoodchain.blockscout.com/address/0xea561e058313b96011e5070ca7d0f027a44e3748
const V3_FACTORY = '0xea561e058313b96011e5070ca7d0f027a44e3748'
// RobinSwap V2 uses a 25 bps swap fee; V3 fee tiers are emitted by each pool.
const V2_FEE = 0.0025
// The enabled V2 fee switch retains 25% of swap fees; 75% accrues to LPs.
const V2_PROTOCOL_REVENUE_RATIO = 0.25
// RobinSwap V3 pools initialize with feeProtocol = 0x77, a 1/7 protocol cut.
const V3_PROTOCOL_REVENUE_RATIO = 1 / 7
const V2_FACTORY_START_BLOCK = 6027468
const V3_FACTORY_START_BLOCK = 6027468
const PAIR_CREATED_EVENT = 'event PairCreated(address indexed token0, address indexed token1, address pair, uint256)'
const POOL_CREATED_EVENT = 'event PoolCreated(address indexed token0, address indexed token1, uint24 indexed fee, int24 tickSpacing, address pool)'

const fetch = async (options: FetchOptions) => {
  // Discover pools directly so this adapter is independent of the shared TVL
  // cache and can return zero cleanly before the first pair is created.
  const pairLogs = await options.getLogs({
    target: V2_FACTORY,
    eventAbi: PAIR_CREATED_EVENT,
    fromBlock: V2_FACTORY_START_BLOCK,
    cacheInCloud: true,
  })
  const v2 = pairLogs.length
    ? await getUniV2LogAdapter({
    factory: V2_FACTORY,
    fees: V2_FEE,
    userFeesRatio: 1,
    revenueRatio: V2_PROTOCOL_REVENUE_RATIO,
    protocolRevenueRatio: V2_PROTOCOL_REVENUE_RATIO,
    allowReadPairs: true,
    })(options)
    : undefined

  // Read this factory directly instead of relying on the shared V3 TVL cache:
  // the dimensions adapter can therefore run before the TVL adapter is merged.
  const poolLogs = await options.getLogs({
    target: V3_FACTORY,
    eventAbi: POOL_CREATED_EVENT,
    fromBlock: V3_FACTORY_START_BLOCK,
    cacheInCloud: true,
  })
  const pools = poolLogs.map((log: any) => log.pool)
  const v3 = pools.length
    ? await getUniV3LogAdapter({
      pools,
      userFeesRatio: 1,
      revenueRatio: V3_PROTOCOL_REVENUE_RATIO,
      protocolRevenueRatio: V3_PROTOCOL_REVENUE_RATIO,
    })(options)
    : undefined

  const dailyVolume = options.createBalances()
  const dailyFees = options.createBalances()
  const dailyRevenue = options.createBalances()
  const dailyProtocolRevenue = options.createBalances()
  const dailySupplySideRevenue = options.createBalances()
  if (v2) {
    dailyVolume.add(v2.dailyVolume)
    dailyFees.add(v2.dailyFees)
    dailyRevenue.add(v2.dailyRevenue)
    dailyProtocolRevenue.add(v2.dailyProtocolRevenue)
    dailySupplySideRevenue.add(v2.dailySupplySideRevenue)
  }
  if (v3) {
    dailyVolume.add(v3.dailyVolume)
    dailyFees.add(v3.dailyFees)
    dailyRevenue.add(v3.dailyRevenue)
    dailyProtocolRevenue.add(v3.dailyProtocolRevenue)
    dailySupplySideRevenue.add(v3.dailySupplySideRevenue)
  }

  return { dailyVolume, dailyFees, dailyUserFees: dailyFees, dailyRevenue, dailyProtocolRevenue, dailySupplySideRevenue }
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  chains: [CHAIN.ROBINHOOD],
  fetch,
  // Set one day before deployment so the adapter's initial daily test runs.
  start: '2026-07-09',
  methodology: {
    Volume: 'Counts the absolute token amounts in RobinSwap V2 and V3 Swap events.',
    Fees: 'V2 swaps charge 0.25%. V3 pool fees are read from each pool’s creation event.',
    UserFees: 'All swap fees are paid by traders.',
    Revenue: '25% of V2 swap fees and 1/7 of V3 pool fees accrue to the protocol.',
    ProtocolRevenue: 'Protocol-retained portion of RobinSwap V2 and V3 swap fees.',
    SupplySideRevenue: '75% of V2 fees and 6/7 of V3 pool fees accrue to liquidity providers.',
  },
  breakdownMethodology: {
    Fees: {
      'Token Swap Fees': 'Swap fees charged by RobinSwap V2 and V3 pools.',
    },
    UserFees: {
      'Trading fees': 'Swap fees paid by traders to RobinSwap V2 and V3 pools.',
    },
    Revenue: {
      'Protocol fees': '25% of RobinSwap V2 fees and 1/7 of RobinSwap V3 fees retained by the protocol.',
    },
    ProtocolRevenue: {
      'Protocol fees': '25% of RobinSwap V2 fees and 1/7 of RobinSwap V3 fees retained by the protocol.',
    },
    SupplySideRevenue: {
      'LP fees': '75% of RobinSwap V2 fees and 6/7 of RobinSwap V3 fees accruing to liquidity providers.',
    },
  },
}

export default adapter
