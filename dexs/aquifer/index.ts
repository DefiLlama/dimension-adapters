// Program: AQU1FRd7papthgdrwPTTq5JacJh8YtwEXaBfKU3bTz45

import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types"
import { CHAIN } from "../../helpers/chains"
import { queryDuneSql } from "../../helpers/dune"

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const query = `
    select
      sum(amount_usd) as daily_volume
    from dex_solana.trades
    where TIME_RANGE
      and block_time >= from_unixtime(${options.startTimestamp})
      and block_time <= from_unixtime(${options.endTimestamp})
      and project = 'aquifer'
  `
  const data = await queryDuneSql(options, query)

  return {
    dailyVolume: Number(data?.[0]?.daily_volume) || 0,
  }
}

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.SOLANA],
  dependencies: [Dependencies.DUNE],
  isExpensiveAdapter: true,
  start: '2025-09-07',
}

export default adapter
