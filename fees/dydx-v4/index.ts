import { ChainBlocks, FetchOptions, SimpleAdapter } from '../../adapters/types'
import { httpGet } from '../../utils/fetchURL'
import { METRIC } from '../../helpers/metrics'

interface IFees {
  day: string
  sum_tradingfeecollection: string
}
const fetchFees  = async (_: number, _t: ChainBlocks ,options: FetchOptions) => {
  const url = 'https://public-dydx-api.numia.xyz/dydx/transparency/trading-fees'
  const res = await httpGet(url)
  delete res['latestTen']
  const item: IFees[] = Object.values(res)
  const dailyFeesAmount = item.find((i) => i.day.split(' ')[0] === options.dateString)?.sum_tradingfeecollection
  const dailyFeesNum = dailyFeesAmount ? parseFloat(dailyFeesAmount) : undefined

  const dailyFees = options.createBalances()
  if (dailyFeesNum) {
    dailyFees.addUSDValue(dailyFeesNum, METRIC.TRADING_FEES)
  }

  const dailyHoldersRevenue = dailyFees.clone(1, METRIC.STAKING_REWARDS)

  return {
    dailyFees,
    dailyRevenue: dailyHoldersRevenue,
    dailyHoldersRevenue,
  }
}

const methodology = {
  Fees: "All trading fees collected from perpetual futures trades on dYdX v4",
  Revenue: "100% of trading fees distributed to DYDX token stakers",
  HoldersRevenue: "All trading fees are distributed to DYDX token stakers as staking rewards"
}

const breakdownMethodology = {
  Fees: {
    [METRIC.TRADING_FEES]: "Fees paid by traders on perpetual futures positions including taker fees, maker fees, and liquidation fees"
  },
  HoldersRevenue: {
    [METRIC.STAKING_REWARDS]: "100% of trading fees distributed to DYDX token stakers via the staking rewards mechanism"
  }
}

const adapter: SimpleAdapter = {
  adapter: {
    "dydx": {
      fetch: fetchFees,
      start: '2023-11-12',
    }
  },
  methodology,
  breakdownMethodology
}

export default adapter
