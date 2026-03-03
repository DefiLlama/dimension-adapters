import { ChainBlocks, FetchOptions, SimpleAdapter } from '../../adapters/types'
import { httpGet } from '../../utils/fetchURL'

interface IFees {
  day: string
  sum_tradingfeecollection: string
}
const fetchFees  = async (_: number, _t: ChainBlocks ,options: FetchOptions) => {
  const url = 'https://public-dydx-api.numia.xyz/dydx/transparency/trading-fees'
  const res = await httpGet(url)
  delete res['latestTen']
  const item: IFees[] = Object.values(res)
  const dailyFees = item.find((i) => i.day.split(' ')[0] === options.dateString)?.sum_tradingfeecollection
  const dailyFeesNum = dailyFees ? parseFloat(dailyFees) : undefined

  return {
    dailyFees: dailyFeesNum,
    dailyRevenue: dailyFeesNum,
    dailyHoldersRevenue: dailyFeesNum,
  }
}

const adapter: SimpleAdapter = {
  adapter: {
    "dydx": {
      fetch: fetchFees,
      start: '2023-11-12',
    }
  }
}

export default adapter
