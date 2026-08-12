import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryDuneSql } from "../helpers/dune";

// Pump.fun app (interface listing). Trades placed through the official pump.fun
// mobile/web app invoke the app program below in the same transaction.
const APP_PROGRAM = '6Vo3245eszAb5wuqEMw8mGdbfRUdKbHhDHP5LcaGuTAB'

const fetch = async (options: FetchOptions) => {
  const rows = await queryDuneSql(options, `
    WITH app_tx AS (
        SELECT DISTINCT tx_id
        FROM solana.instruction_calls
        WHERE executing_account = '${APP_PROGRAM}'
          AND tx_success
          AND TIME_RANGE
    )
    SELECT
      COUNT(DISTINCT tr.trader_id) AS active_users,
      COUNT(DISTINCT tr.tx_id) AS txs
    FROM dex_solana.trades tr
    JOIN app_tx a ON tr.tx_id = a.tx_id
    WHERE tr.project IN ('pumpdotfun', 'pumpswap')
      AND tr.block_time >= from_unixtime(${options.startTimestamp})
      AND tr.block_time <= from_unixtime(${options.endTimestamp})
  `)
  return {
    dailyActiveUsers: rows[0].active_users,
    dailyTransactionsCount: rows[0].txs,
  }
}

// version 1: dailyActiveUsers is a daily-unique count and cannot be summed from
// hourly slices, and all Dune adapters are version 1.
const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.SOLANA],
  start: '2026-05-21', // first tx of the app program
  dependencies: [Dependencies.DUNE],
  isExpensiveAdapter: true,
  methodology:
    'Counts unique traders and transactions on pump.fun bonding curves and PumpSwap from trades placed through the official pump.fun app (transactions invoking the app program).',
}

export default adapter
