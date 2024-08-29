import { ChainBlocks, FetchOptions, SimpleAdapter } from '../../adapters/types'
import { httpGet } from '../../utils/fetchURL'

interface IFees {
  day: string
  sum_tradingfeecollection: string
}
const fetchFees  = async (timestamp: number, _t: ChainBlocks ,options: FetchOptions) => {
  const url = 'https://api.lacertalabs.xyz/data/tradingfeecollection'
  const dateStr = new Date(options.startOfDay * 1000).toISOString().split('T')[0]
  const res = await httpGet(url)
  delete res['latestTen']
  const item: IFees[] = Object.values(res)
  const dailyFees = item.find((i) => i.day.split('T')[0] === dateStr)?.sum_tradingfeecollection
  const dailyFeesNum = dailyFees ? parseFloat(dailyFees) : undefined
  return {
    dailyFees: dailyFeesNum,
    dailyRevenue: dailyFeesNum,
    dailyHoldersRevenue: dailyFeesNum,
    timestamp: timestamp,
  }
}

const adapter: SimpleAdapter = {
  adapter: {
    "dydx": {
      fetch: fetchFees,
      start: 1699747200,
    }
  }
}

export default adapter
