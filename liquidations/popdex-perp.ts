import { FetchOptions, SimpleAdapter } from '../adapters/types'
import { CHAIN } from '../helpers/chains'
import { fetchPerpsMetrics, perpsWindowMs } from '../helpers/popdex'

const fetch = async (options: FetchOptions) => {
  const { startTime, endTime } = perpsWindowMs(options)
  const m = await fetchPerpsMetrics(startTime, endTime)
  const dailyLiquidationVolume = options.createBalances()
  dailyLiquidationVolume.addUSDValue(m.liquidationVolume)
  return { dailyLiquidationVolume }
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.MORPH_TACHYON],
  start: '2026-09-25',
  methodology: {
    LiquidationVolume: 'Notional of positions liquidated in the window (size times fill price, in USDT). Does not include margin seized into the insurance fund.',
  },
}

export default adapter
