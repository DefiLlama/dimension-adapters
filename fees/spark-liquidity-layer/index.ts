import { FetchOptions, FetchResultFees, SimpleAdapter } from "../../adapters/types"
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


const fetch = async (options: FetchOptions): Promise<FetchResultFees> => {
  const dailyRevenue = options.createBalances()

  const revenueData: ResponseSchema = await fetchURL('https://spark2-api.blockanalitica.com/sparkstar/sll/?days_ago=365')

  const startDay = getDay(options.startOfDay)
  const previousDay = getDay(options.startOfDay - DAY)

  const currentData = revenueData.historic.find(({date}) => date === startDay)
  const previousData = revenueData.historic.find(({date}) => date === previousDay)

  if (currentData === undefined || previousData === undefined) {
    return {dailyFees: dailyRevenue, dailyRevenue: dailyRevenue, dailyProtocolRevenue: dailyRevenue}
  }

  const buidlRevenue = await getBuidlRevenue(options)

  dailyRevenue.addUSDValue(Number(currentData.profit_total) - Number(previousData.profit_total))
  dailyRevenue.subtractToken(buidl, buidlRevenue)

  return {dailyRevenue}
}

const buidl = '0x6a9DA2D710BB9B700acde7Cb81F10F1fF8C89041'
const buidlIssueEvent = 'event Issue(address indexed to, uint256 value, uint256 valueLocked)'
const toAlmControllerTopic = '0x0000000000000000000000001601843c5E9bC251A3272907010AFa41Fa18347E'

const getBuidlRevenue = async (options: FetchOptions) => {
  const data: [string, bigint, bigint][] = await options.getLogs({
    target: buidl,
    eventAbi: buidlIssueEvent,
    topics: [null as any, toAlmControllerTopic],
  })

  return data.reduce((result, issueLog) => result + issueLog[1], 0n)
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