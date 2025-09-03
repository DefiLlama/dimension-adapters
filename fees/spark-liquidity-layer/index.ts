import { FetchOptions, FetchResultFees, SimpleAdapter } from '../../adapters/types'
import { CHAIN } from '../../helpers/chains'
import { METRIC } from '../../helpers/metrics'
import { getSqlFromFile, queryDuneSql } from '../../helpers/dune'

const getDay = (ts: number) => new Date(ts * 1000).toISOString().split('T')[0]

async function fetch(options: FetchOptions): Promise<FetchResultFees> {
  const dailyRevenue = options.createBalances()

  const date = getDay(options.startOfDay)
  const sql = getSqlFromFile('fees/spark-liquidity-layer/spark-liquidity-layer-revenue.sql', { dt: date })

  const response = await queryDuneSql(options, sql)

  dailyRevenue.addUSDValue(response[0].revenue, METRIC.ASSETS_YIELDS,{ skipChain: true })

  return { dailyFees: dailyRevenue, dailyRevenue, dailyProtocolRevenue: dailyRevenue, }
}

const methodology = {
  Fees: 'Fees collected minus the Sky Base Rate (vault stability fee) plus the monthly offchain rebate calculation for things like idle USDS.',
  Revenue: 'Fees collected minus the Sky Base Rate (vault stability fee) plus the monthly offchain rebate calculation for things like idle USDS.',
  ProtocolRevenue: 'All revenue are collected by Spark protocol.',
}

const breakdownMethodology = {
  Fees: {
    [METRIC.ASSETS_YIELDS]: 'Fees collected minus the Sky Base Rate (vault stability fee) plus the monthly offchain rebate calculation for things like idle USDS.',
  },
  Revenue: {
    [METRIC.ASSETS_YIELDS]: 'Fees collected minus the Sky Base Rate (vault stability fee) plus the monthly offchain rebate calculation for things like idle USDS.',
  },
  ProtocolRevenue: {
    [METRIC.ASSETS_YIELDS]: 'All revenue are collected by Spark protocol.',
  },
}

const adapter: SimpleAdapter = {
  version: 2,
  methodology,
  breakdownMethodology,
  fetch,
  start: '2025-07-01',
  chains: [CHAIN.ETHEREUM],
}

export default adapter
