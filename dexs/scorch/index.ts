// Program: SCoRcH8c2dpjvcJD6FiPbCSQyQgu3PcUAWj2Xxx3mqn

import { Dependencies, FetchOptions, FetchResult, SimpleAdapter } from "../../adapters/types"
import { CHAIN } from "../../helpers/chains"
import { queryDuneSql } from "../../helpers/dune"

const fetchSolana = async (_a: any, _b: any, options: FetchOptions) => {
  const query = `
    SELECT
      date_trunc('day', block_time) AS day,
      SUM(amount_usd) AS daily_volume
    FROM dex_solana.trades
    WHERE project = 'scorch'
      AND block_time >= from_unixtime(${options.startTimestamp})
      AND block_time <= from_unixtime(${options.endTimestamp})
  `;
  const data = await queryDuneSql(options, query)

  return {
    dailyVolume: data[0]?.daily_volume ?? 0
  }
}


const adapter: SimpleAdapter = {
  version: 1,
  adapter: {
    [CHAIN.SOLANA]: {
      fetch: fetchSolana,
      start: '2026-01-16',
    },
  },
  dependencies: [Dependencies.DUNE],
  isExpensiveAdapter: true,
}

export default adapter
