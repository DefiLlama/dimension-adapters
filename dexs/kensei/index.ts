import { Dependencies, FetchOptions, SimpleAdapter } from '../../adapters/types';
import { CHAIN } from '../../helpers/chains';
import { queryDuneSql } from '../../helpers/dune';

const fetch = async (_a:any, _b:any, options: FetchOptions) => {
  const query = `
    WITH buy_volume AS (
        SELECT SUM(usd_in) AS total_buy_usd
        FROM query_5971327
        WHERE block_time >= from_unixtime(${options.startTimestamp})
          AND block_time < from_unixtime(${options.endTimestamp})
    ),
    sell_volume AS (
        SELECT SUM(usd_out) AS total_sell_usd
        FROM query_5971367
        WHERE block_time >= from_unixtime(${options.startTimestamp})
          AND block_time < from_unixtime(${options.endTimestamp})
    )
    SELECT
        COALESCE(b.total_buy_usd, 0) + COALESCE(s.total_sell_usd, 0) AS total_volume_usd
    FROM buy_volume b
    CROSS JOIN sell_volume s;
  `

  let dailyVolume = options.createBalances()
  const result = await queryDuneSql(options, query)

  if (result && result.length > 0) {
    dailyVolume.addUSDValue(result[0].total_volume_usd)
  }

  return { dailyVolume }
}

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.KATANA],
  start: '2025-10-16',
  dependencies: [Dependencies.DUNE],
  isExpensiveAdapter: true,
}

export default adapter