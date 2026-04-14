// Program: goonERTdGsjnkZqWuVjs73BZ3Pb9qoCUdBUL17BnS5j

import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types"
import { CHAIN } from "../../helpers/chains"
import { queryDuneSql } from "../../helpers/dune"

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const query = `
    select 
        sum(amount_usd) as daily_volume
    from dex_solana.trades
    where project = 'goonfi'
    and TIME_RANGE
    `
  const data = await queryDuneSql(options, query)

  return {
    dailyVolume: data[0]?.daily_volume ?? 0
  }
}

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  dependencies: [Dependencies.DUNE],
  chains: [CHAIN.SOLANA],
  start: '2025-05-22',
}

export default adapter
