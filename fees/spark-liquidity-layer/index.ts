import { Dependencies, FetchOptions, FetchResultFees, SimpleAdapter } from '../../adapters/types'
import { CHAIN } from '../../helpers/chains'
import { METRIC } from '../../helpers/metrics'
import { getSqlFromFile, queryDuneSql } from '../../helpers/dune'

const getDay = (ts: number) => new Date(ts * 1000).toISOString().split('T')[0]

async function fetch(_: any, _1: any, options: FetchOptions): Promise<FetchResultFees> {
  const dailyRevenue = options.createBalances()
  const dailyFees = options.createBalances()
  const dailySupplySideRevenue = options.createBalances()

  const date = getDay(options.startOfDay)
  const sql = getSqlFromFile('fees/spark-liquidity-layer/spark-liquidity-layer-revenue.sql', { dt: date })

  const response = await queryDuneSql(options, sql)

  const dssr = Number(response[0].fees) - Number(response[0].revenue)

  dailyFees.addUSDValue(response[0].fees, METRIC.ASSETS_YIELDS)
  dailyRevenue.addUSDValue(response[0].revenue, METRIC.ASSETS_YIELDS)
  dailySupplySideRevenue.addUSDValue(dssr, METRIC.ASSETS_YIELDS)

  return { dailyFees, dailyRevenue, dailySupplySideRevenue, dailyProtocolRevenue: dailyRevenue, }
}

const methodology = {
  Fees: 'Total interest earned on all loans.',
  Revenue: 'Fees collected minus the Sky Base Rate (vault stability fee) plus the monthly offchain rebate calculation for things like idle USDS.',
  SupplySideRevenue: 'Fees collected distributed to supply-side depositors.',
  ProtocolRevenue: 'All revenue are collected by Spark protocol.',
}

const breakdownMethodology = {
  Fees: {
    [METRIC.ASSETS_YIELDS]: 'Total interest earned on all loans.',
  },
  Revenue: {
    [METRIC.ASSETS_YIELDS]: 'Fees collected minus the Sky Base Rate (vault stability fee) plus the monthly offchain rebate calculation for things like idle USDS.',
  },
  SupplySideRevenue: {
    [METRIC.ASSETS_YIELDS]: 'Fees collected distributed to supply-side depositors.',
  },
  ProtocolRevenue: {
    [METRIC.ASSETS_YIELDS]: 'All revenue are collected by Spark protocol.',
  },
}

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.ETHEREUM],
  start: '2025-07-01',
  dependencies: [Dependencies.DUNE],
  methodology,
  breakdownMethodology,
  allowNegativeValue: true,
}

export default adapter
