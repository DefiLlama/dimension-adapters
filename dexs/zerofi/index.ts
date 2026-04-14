// Program: ZERor4xhbUycZ6gb9ntrhqscUcZmAbQDjEAtCf4hbZY

import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types"
import { CHAIN } from "../../helpers/chains"
import { queryDuneSql } from "../../helpers/dune"

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const query = `
    select 
        sum(amount_usd) as daily_volume
    from dex_solana.trades
    where project = 'zerofi'
    and TIME_RANGE
  `
  const data = await queryDuneSql(options, query)

  return {
    dailyVolume: data[0]?.daily_volume ?? 0
  }
}

const adapter: SimpleAdapter = {
  fetch,
  dependencies: [Dependencies.DUNE],
  chains: [CHAIN.SOLANA],
  start: '2024-12-12',
}

export default adapter
