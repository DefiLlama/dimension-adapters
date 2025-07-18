import { FetchOptions, FetchResultFees, SimpleAdapter } from "../../adapters/types"
import { CHAIN } from "../../helpers/chains"
import fetchURL from "../../utils/fetchURL"
import { DAY } from "../../utils/date"
import BigNumber from "bignumber.js"

const getDay = (ts: number) => new Date(ts * 1000).toISOString().split('T')[0]

type ResponseSchema = {
  historic: [{
    date: string,
    profit_total: string
  }]
}


async function fetch(options: FetchOptions): Promise<FetchResultFees> {
  const dailyRevenue = options.createBalances()

  const revenueData: ResponseSchema = await fetchURL('https://spark2-api.blockanalitica.com/sparkstar/sll/?days_ago=365')

  const startDay = getDay(options.startOfDay)
  const previousDay = getDay(options.startOfDay - DAY)

  const currentData = revenueData.historic.find(({date}) => date === startDay)
  const previousData = revenueData.historic.find(({date}) => date === previousDay)

  if (currentData === undefined || previousData === undefined) {
    return { dailyRevenue }
  }

  dailyRevenue.addUSDValue(Number(currentData.profit_total) - Number(previousData.profit_total))

  const buidlDebtCost = await getBuidlDebtCost(options, startDay)
  dailyRevenue.addUSDValue(buidlDebtCost)

  const buidlRevenue = await getBuidlRevenue(options)
  dailyRevenue.subtractToken(buidl, buidlRevenue)

  return { dailyRevenue }
}

const buidl = '0x6a9da2d710bb9b700acde7cb81f10f1ff8c89041'
const buidlIssueEvent = 'event Issue(address indexed to, uint256 value, uint256 valueLocked)'
const toAlmControllerTopic = '0x0000000000000000000000001601843c5E9bC251A3272907010AFa41Fa18347E'

async function getBuidlRevenue(options: FetchOptions): Promise<bigint> {
  const data: [string, bigint, bigint][] = await options.getLogs({
    target: buidl,
    eventAbi: buidlIssueEvent,
    topics: [null as any, toAlmControllerTopic],
  })

  return data.reduce((result, issueLog) => result + issueLog[1], 0n)
}

const almController = '0x1601843c5e9bc251a3272907010afa41fa18347e'
const susds = '0xa3931d71877C0E7a3148CB7Eb4463524FEc27fbD'

type BuidlSchema = {
  historic: [{
    date: string
    principal: string,
  }]
}

async function getBuidlDebtCost(options: FetchOptions, startDay: string): Promise<BigNumber> {
  const buidlData: BuidlSchema = await fetchURL(`https://spark2-api.blockanalitica.com/sparkstar/sll/tokens/ethereum/${almController}/${buidl}/?days_ago=365`)
  const currentData = buidlData.historic.find(({date}) => date === startDay)
  if (!currentData) {
    return BigNumber(0)
  }

  const ssr: string = await options.api.call({
    target: susds,
    abi:'function ssr() view returns (uint256)',
  })
  const dailySsr = pow((BigNumber(ssr).div(10 ** 27)), DAY).minus(1)

  return BigNumber(currentData.principal).times(dailySsr)
}

function pow(a: BigNumber, b: number): BigNumber {
  return BigNumber.clone({ POW_PRECISION: 100 }).prototype.pow.apply(a, [b])
}


const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch,
      start: '2024-07-20',
      meta: {
        methodology: {
          Revenue: 'Fees collected minus the Sky Base Rate (vault stability fee) plus the monthly offchain rebate calculation for things like idle USDS.',
        }
      }
    }
  }
}

export default adapter