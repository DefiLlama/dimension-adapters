// Program: AQU1FRd7papthgdrwPTTq5JacJh8YtwEXaBfKU3bTz45

import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types"
import { CHAIN } from "../../helpers/chains"
import { queryDuneSql } from "../../helpers/dune"

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
    // Workaround for dune indexing issue
    const now = Date.now()
    const tenHoursAgo = now - (10 * 60 * 60 * 1000)
    if ((options.toTimestamp * 1000) > tenHoursAgo) {
        console.log("End timestamp is less than 10 hours ago, skipping fetch due to dune indexing delay", new Date(options.toTimestamp * 1000).toISOString(), new Date(tenHoursAgo).toISOString())
        throw new Error("End timestamp is less than 10 hours ago, skipping due to dune indexing delay")
    }
    
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
