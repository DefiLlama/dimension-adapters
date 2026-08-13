import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryDuneSql } from "../helpers/dune";

// Pump.fun app (interface listing). Trades placed through the official pump.fun
// mobile app invoke the app program below in the same transaction (the web app builds
// direct program instructions and never touches it); that is how a
// slice of pump.fun bonding-curve + PumpSwap activity is attributed to the app.
// Volume here is doublecounted with the parent pumpdotfun / pump-swap listings.
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
    SELECT COALESCE(SUM(tr.amount_usd), CAST(0 AS double)) AS volume
    FROM dex_solana.trades tr
    JOIN app_tx a ON tr.tx_id = a.tx_id
    WHERE tr.project IN ('pumpdotfun', 'pumpswap')
      AND tr.block_time >= from_unixtime(${options.startTimestamp})
      AND tr.block_time <= from_unixtime(${options.endTimestamp})
  `)
  return { dailyVolume: rows[0].volume }
}

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.SOLANA],
  start: '2026-05-21', // first tx of the app program
  doublecounted: true, // app volume is already counted in the parent pumpdotfun / pump-swap listings
  dependencies: [Dependencies.DUNE],
  isExpensiveAdapter: true,
  methodology: {
    Volume: 'Trading volume on pump.fun bonding curves and PumpSwap from trades placed through the official pump.fun mobile app (transactions invoking the app program). Already counted in the parent pump.fun and PumpSwap listings.',
  },
}

export default adapter
