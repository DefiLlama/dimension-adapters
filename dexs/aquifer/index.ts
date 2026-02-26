// Program: AQU1FRd7papthgdrwPTTq5JacJh8YtwEXaBfKU3bTz45

import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types"
import { CHAIN } from "../../helpers/chains"
import { queryDuneSql } from "../../helpers/dune"

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
    const query = `
    select
      coalesce(sum(amount_usd), 0) as daily_volume
    from dex_solana.trades
    where TIME_RANGE
      and project = 'aquifer'
  `
    const data = await queryDuneSql(options, query)

    return {
        dailyVolume: data[0].daily_volume,
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
