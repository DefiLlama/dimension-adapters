import { FetchOptions, SimpleAdapter } from '../../adapters/types'
import { CHAIN } from '../../helpers/chains'
import { getUniV2LogAdapter, getUniV3LogAdapter } from '../../helpers/uniswap'

// RobinSwap V2 factory: https://robinhoodchain.blockscout.com/address/0xa95DA9b9fCef09A07F99444fE9304457d6ECdccA
const V2_FACTORY = '0xa95DA9b9fCef09A07F99444fE9304457d6ECdccA'
// RobinSwap V3 factory: https://robinhoodchain.blockscout.com/address/0xea561e058313b96011e5070ca7d0f027a44e3748
const V3_FACTORY = '0xea561e058313b96011e5070ca7d0f027a44e3748'
// RobinSwap V2 uses a 25 bps swap fee; V3 fee tiers are emitted by each pool.
const V2_FEE = 0.0025
const V3_FACTORY_START_BLOCK = 6027468
const POOL_CREATED_EVENT = 'event PoolCreated(address indexed token0, address indexed token1, uint24 indexed fee, int24 tickSpacing, address pool)'

const fetch = async (options: FetchOptions) => {
  const v2 = await getUniV2LogAdapter({
    factory: V2_FACTORY,
    fees: V2_FEE,
    userFeesRatio: 1,
  })(options)

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
    ? await getUniV3LogAdapter({ pools, userFeesRatio: 1 })(options)
    : undefined

  const dailyVolume = options.createBalances()
  const dailyFees = options.createBalances()
  dailyVolume.add(v2.dailyVolume)
  dailyFees.add(v2.dailyFees)
  if (v3) {
    dailyVolume.add(v3.dailyVolume)
    dailyFees.add(v3.dailyFees)
  }

  return { dailyVolume, dailyFees, dailyUserFees: dailyFees }
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  chains: [CHAIN.ROBINHOOD],
  fetch,
  // Set one day before deployment so the adapter's initial daily test runs.
  start: '2026-07-09',
  // The V2 feeTo mint and V3 protocol-fee settings need independent accounting;
  // do not label an unverified portion of swap fees as protocol revenue.
  skipBreakdownValidation: true,
  methodology: {
    Volume: 'Counts the absolute token amounts in RobinSwap V2 and V3 Swap events.',
    Fees: 'V2 swaps charge 0.25%. V3 pool fees are read from each pool’s creation event.',
    UserFees: 'All swap fees are paid by traders.',
  },
  breakdownMethodology: {
    Fees: {
      'Token Swap Fees': 'Swap fees charged by RobinSwap V2 and V3 pools.',
    },
    UserFees: {
      'Token Swap Fees': 'Swap fees paid by traders to RobinSwap V2 and V3 pools.',
    },
  },
}

export default adapter
