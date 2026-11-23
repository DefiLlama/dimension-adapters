import { Dependencies, FetchOptions, SimpleAdapter } from '../adapters/types'
import { CHAIN } from '../helpers/chains'
import { queryAllium } from '../helpers/allium'
import { METRIC } from '../helpers/metrics'
import { EXCLUDED_USERS, MAJOR_TOKENS, VEAX, assertIndexed, indexedCheckSql, sqlList } from '../dexs/veax'

const FEE_RATES = [1, 2, 4, 8, 16, 32, 64, 128]
const FEE_DIVISOR = 10000

const PROTOCOL_FEE_CHANGE = '2025-05-20 12:27:47'
const PROTOCOL_FEE_FRACTION = { before: 1, after: 2000 }

const fetch = async (options: FetchOptions) => {
  const majors = sqlList(Object.keys(MAJOR_TOKENS))
  const rows = await queryAllium(`
    WITH pool_states AS (
      SELECT signer_id, transaction_block_timestamp AS ts,
        TO_NUMBER(transaction_block_height) AS h, TO_NUMBER(transaction_index) AS ti, log_index,
        event_data:pool[0]::STRING AS token_a, event_data:pool[1]::STRING AS token_b, event_data:type::STRING AS type,
        event_data:amounts_a AS a, event_data:amounts_b AS b
      FROM near.raw.event_logs
      WHERE executor_id = '${VEAX}' AND event_standard = 'veax' AND event_name = 'update_pool_state'
        -- a receipt that panics (slippage, gas) keeps its logs but its state change is rolled back
        AND success
        AND transaction_block_timestamp < TO_TIMESTAMP_NTZ(${options.endTimestamp})
    ),
    states AS (
      -- the window's state changes, plus each pool's last state before the window to diff the first one against
      SELECT * FROM pool_states WHERE ts >= TO_TIMESTAMP_NTZ(${options.startTimestamp})
      UNION ALL
      SELECT * FROM pool_states WHERE ts < TO_TIMESTAMP_NTZ(${options.startTimestamp})
      QUALIFY ROW_NUMBER() OVER (PARTITION BY token_a, token_b ORDER BY h DESC, ti DESC, log_index DESC) = 1
    ),
    diffs AS (
      SELECT *, LAG(a) OVER (PARTITION BY token_a, token_b ORDER BY h, ti, log_index) AS prev_a,
        LAG(b) OVER (PARTITION BY token_a, token_b ORDER BY h, ti, log_index) AS prev_b
      FROM states
    ),
    swaps AS (
      SELECT d.ts, d.token_a, d.token_b, d.prev_a IS NULL AS no_prev,
        SUM(GREATEST(TRY_TO_DOUBLE(l.value::STRING) - TRY_TO_DOUBLE(d.prev_a[l.index]::STRING), 0)) AS in_a,
        SUM(GREATEST(TRY_TO_DOUBLE(d.prev_a[l.index]::STRING) - TRY_TO_DOUBLE(l.value::STRING), 0)) AS out_a,
        SUM(GREATEST(TRY_TO_DOUBLE(d.b[l.index]::STRING) - TRY_TO_DOUBLE(d.prev_b[l.index]::STRING), 0)) AS in_b,
        SUM(GREATEST(TRY_TO_DOUBLE(d.prev_b[l.index]::STRING) - TRY_TO_DOUBLE(d.b[l.index]::STRING), 0)) AS out_b,
        SUM(GREATEST(TRY_TO_DOUBLE(l.value::STRING) - TRY_TO_DOUBLE(d.prev_a[l.index]::STRING), 0)
          * ARRAY_CONSTRUCT(${FEE_RATES.join(', ')})[l.index]) / ${FEE_DIVISOR} AS fee_a,
        SUM(GREATEST(TRY_TO_DOUBLE(d.b[l.index]::STRING) - TRY_TO_DOUBLE(d.prev_b[l.index]::STRING), 0)
          * ARRAY_CONSTRUCT(${FEE_RATES.join(', ')})[l.index]) / ${FEE_DIVISOR} AS fee_b
      FROM diffs d, LATERAL FLATTEN(input => d.a) l
      WHERE d.ts >= TO_TIMESTAMP_NTZ(${options.startTimestamp}) AND d.type = 'swap'
        AND d.signer_id NOT IN (${sqlList(EXCLUDED_USERS)})
      GROUP BY d.ts, d.h, d.ti, d.log_index, d.token_a, d.token_b, d.prev_a IS NULL
    ),
    fees AS (
      -- the fee is paid in the sold token; it is valued on the pool's major token side at the swap's own rate
      SELECT IFF(token_a IN (${majors}), token_a, token_b) AS token,
        IFF(token_a IN (${majors}),
          IFF(in_a > 0, fee_a, out_a * fee_b / NULLIF(in_b, 0)),
          IFF(in_b > 0, fee_b, out_b * fee_a / NULLIF(in_a, 0))) AS fee,
        IFF(ts < '${PROTOCOL_FEE_CHANGE}', ${PROTOCOL_FEE_FRACTION.before}, ${PROTOCOL_FEE_FRACTION.after}) / ${FEE_DIVISOR} AS protocol_share
      FROM swaps
      WHERE NOT no_prev AND (token_a IN (${majors}) OR token_b IN (${majors}))
    ),
    totals AS (
      SELECT token, SUM(fee) AS fees, SUM(fee * protocol_share) AS protocol_fees FROM fees GROUP BY token
    ),
    checks AS (
      SELECT (${indexedCheckSql(options)}) AS indexed, (SELECT COUNT(*) FROM swaps WHERE no_prev) AS swaps_without_prior_state
    )
    SELECT checks.*, totals.*
    FROM checks LEFT JOIN totals ON TRUE
  `)
  assertIndexed(rows[0], options)
  if (Number(rows[0].swaps_without_prior_state) > 0)
    throw new Error(`veax: ${rows[0].swaps_without_prior_state} swaps hit a pool with no earlier update_pool_state on Allium`)

  const dailyFees = options.createBalances()
  const dailyRevenue = options.createBalances()
  const dailySupplySideRevenue = options.createBalances()
  for (const { token, fees, protocol_fees } of rows) {
    if (!token) continue
    const { cgId, decimals } = MAJOR_TOKENS[token]
    dailyFees.addCGToken(cgId, fees / 10 ** decimals, METRIC.SWAP_FEES)
    dailyRevenue.addCGToken(cgId, protocol_fees / 10 ** decimals, METRIC.PROTOCOL_FEES)
    dailySupplySideRevenue.addCGToken(cgId, (fees - protocol_fees) / 10 ** decimals, METRIC.LP_FEES)
  }

  return {
    dailyFees,
    dailyUserFees: dailyFees.clone(),
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue.clone(),
    dailySupplySideRevenue,
  }
}

const adapter: SimpleAdapter = {
  version: 2,
  // each run reads every pool's last state before the window from the full pool history (~35s on Allium),
  // so it runs once per day instead of 24 times
  pullHourly: false,
  fetch,
  chains: [CHAIN.NEAR],
  start: '2023-04-27',
  dependencies: [Dependencies.ALLIUM],
  methodology: {
    Fees: "Swap fees paid by traders on VEAX pools. Each pool has eight liquidity fee levels from 0.01% to 1.28%, and a swap pays the rate of every level it trades through. Excludes swaps that have no wNEAR, stablecoin, ETH, BTC or stNEAR side, and the 2026-10-31 exploit.",
    UserFees: "Swap fees paid by traders on VEAX pools, at the 0.01% to 1.28% rate of each liquidity fee level a swap trades through.",
    Revenue: "Share of swap fees kept by the VEAX protocol: 20% since 2025-05-20, 0.01% before.",
    ProtocolRevenue: "Share of swap fees accrued to the VEAX protocol inside the veax.near contract: 20% since 2025-05-20, 0.01% before.",
    SupplySideRevenue: "Share of swap fees earned by VEAX liquidity providers: 80% since 2025-05-20, 99.99% before.",
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.SWAP_FEES]: "Swap fees paid by traders, at the rate of each liquidity fee level (0.01% to 1.28%) a swap trades through.",
    },
    UserFees: {
      [METRIC.SWAP_FEES]: "Swap fees paid by traders, at the rate of each liquidity fee level (0.01% to 1.28%) a swap trades through.",
    },
    Revenue: {
      [METRIC.PROTOCOL_FEES]: "Protocol share of swap fees: 20% since 2025-05-20, 0.01% before.",
    },
    ProtocolRevenue: {
      [METRIC.PROTOCOL_FEES]: "Protocol share of swap fees, accrued inside the veax.near contract: 20% since 2025-05-20, 0.01% before.",
    },
    SupplySideRevenue: {
      [METRIC.LP_FEES]: "Liquidity provider share of swap fees: 80% since 2025-05-20, 99.99% before.",
    },
  },
}

export default adapter
