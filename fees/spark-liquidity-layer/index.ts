import { FetchOptions, FetchResultFees, SimpleAdapter } from '../../adapters/types'
import { CHAIN } from '../../helpers/chains'
import { getSqlFromFile, queryDuneSql } from '../../helpers/dune'

const methodology = {
  Revenue: 'Fees collected minus the Sky Base Rate (vault stability fee) plus the monthly offchain rebate calculation for things like idle USDS.',
}

const getDay = (ts: number) => new Date(ts * 1000).toISOString().split('T')[0]

async function fetch(options: FetchOptions): Promise<FetchResultFees> {
  const dailyRevenue = options.createBalances()

  const date = getDay(options.startOfDay)
  const sql = getSqlFromFile('fees/spark-liquidity-layer/spark-liquidity-layer-revenue.sql', {
    dt: date,
  })

  const response = await queryDuneSql(options, sql)
  dailyRevenue.addUSDValue(response[0].revenue, { skipChain: true })

  return { dailyRevenue }
}

const adapter: SimpleAdapter = {
  version: 2,
  methodology,
  start: '2025-07-01',
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch,
    }
  },
}

export default adapter
