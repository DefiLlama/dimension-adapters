import { FetchOptions, SimpleAdapter } from '../../adapters/types'
import { CHAIN } from '../../helpers/chains'
import { getUniV2LogAdapter, getUniV3LogAdapter } from '../../helpers/uniswap'

const V2_FACTORY = '0xa95DA9b9fCef09A07F99444fE9304457d6ECdccA'
const V3_FACTORY = '0xea561e058313b96011e5070ca7d0f027a44e3748'

const fetch = async (options: FetchOptions) => {
  const [v2, v3] = await Promise.all([
    getUniV2LogAdapter({
      factory: V2_FACTORY,
      fees: 0.0025,
      userFeesRatio: 1,
    })(options),
    getUniV3LogAdapter({
      factory: V3_FACTORY,
      userFeesRatio: 1,
    })(options),
  ])

  const dailyVolume = options.createBalances()
  const dailyFees = options.createBalances()
  const dailyUserFees = options.createBalances()

  dailyVolume.add(v2.dailyVolume).add(v3.dailyVolume)
  dailyFees.add(v2.dailyFees).add(v3.dailyFees)
  dailyUserFees.add(v2.dailyUserFees).add(v3.dailyUserFees)

  return { dailyVolume, dailyFees, dailyUserFees }
}

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.ROBINHOOD]: {
      fetch,
      start: '2026-07-10',
    },
  },
  methodology: {
    Volume: 'Counts the absolute token amounts in RobinSwap V2 and V3 Swap events.',
    Fees: 'V2 swaps charge 0.25%. V3 pool fees are read from each pool’s creation event.',
    UserFees: 'All swap fees are paid by traders.',
  },
}

export default adapter
