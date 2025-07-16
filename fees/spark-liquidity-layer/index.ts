import { FetchOptions, SimpleAdapter } from "../../adapters/types"
import { CHAIN } from "../../helpers/chains"
import fetchURL from "../../utils/fetchURL"
import { DAY } from "../../utils/date"

const getDay = (ts: number) => new Date(ts * 1000).toISOString().split('T')[0]

type ResponseSchema = {
  historic: [{
    date: string,
    profit_total: string
  }]
}


const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances()

  const revenueData: ResponseSchema = await fetchURL('https://spark2-api.blockanalitica.com/sparkstar/sll/?days_ago=365')

  const startDay = getDay(options.startOfDay)
  const previousDay = getDay(options.startOfDay - DAY)

  const currentData = revenueData.historic.find(({ date }) => date === startDay)
  const previousData = revenueData.historic.find(({ date }) => date === previousDay)

  if (currentData === undefined || previousData === undefined) {
    return { dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees }
  }

  dailyFees.addUSDValue(Number(currentData.profit_total) - Number(previousData.profit_total))

  return { dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees }
}

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch,
      start: '2024-07-20',
      meta: {
        methodology: {
          Fees: 'Fees',
          Revenue: 'Revenue',
        }
      }
    }
  }
}

export default adapter