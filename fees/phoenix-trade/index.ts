import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";
import { METRIC } from "../../helpers/metrics";

const PHOENIX_PERPS_PROGRAM = "EtrnLzgbS7nMMy5fbD42kXiUzGg8XQzJ972Xtk1cjWih";
const EVENTS = {
  log: "0x8de6d6f209d1cfaa",
  logEventLengths: "0xf70786cbb5479947",
  orderFilled: "0x03",
  splineFilled: "0x05",
  tradeSummary: "0x06",
};

async function fetch(options: FetchOptions) {
  const dailyFees = options.createBalances();

  const query = `
    WITH ixs AS (
      SELECT
        tx_id,
        outer_instruction_index,
        inner_instruction_index,
        data
      FROM solana.instruction_calls
      WHERE TIME_RANGE
        AND executing_account = '${PHOENIX_PERPS_PROGRAM}'
        AND tx_success = true
        AND is_inner = true
        AND bytearray_substring(data, 1, 8) IN (${EVENTS.log}, ${EVENTS.logEventLengths})
    ),
    batches AS (
      SELECT
        l.tx_id,
        l.outer_instruction_index,
        l.inner_instruction_index,
        l.data AS log_data,
        e.data AS lengths_data,
        CAST(bytearray_to_uint256(bytearray_reverse(bytearray_substring(e.data, 13, 4))) AS INTEGER) AS event_count
      FROM ixs l
      JOIN ixs e
        ON l.tx_id = e.tx_id
        AND l.outer_instruction_index = e.outer_instruction_index
        AND l.inner_instruction_index = e.inner_instruction_index + 1
      WHERE bytearray_substring(l.data, 1, 8) = ${EVENTS.log}
        AND bytearray_substring(e.data, 1, 8) = ${EVENTS.logEventLengths}
    ),
    lengths AS (
      SELECT
        b.*,
        event_index,
        CAST(bytearray_to_uint256(bytearray_reverse(bytearray_substring(lengths_data, 17 + (event_index - 1) * 2, 2))) AS INTEGER) AS event_len
      FROM batches b
      CROSS JOIN UNNEST(sequence(1, event_count)) AS t(event_index)
    ),
    events AS (
      SELECT
        bytearray_substring(
          log_data,
          CAST(17 + COALESCE(
            SUM(event_len) OVER (
              PARTITION BY tx_id, outer_instruction_index, inner_instruction_index
              ORDER BY event_index
              ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
            ),
            0
          ) AS INTEGER),
          event_len
        ) AS event_data
      FROM lengths
    ),
    decoded_fees AS (
      SELECT
        CASE
          WHEN bytearray_substring(event_data, 1, 1) = ${EVENTS.tradeSummary}
            THEN CAST(bytearray_to_bigint(bytearray_reverse(bytearray_substring(event_data, 67, 8))) AS DOUBLE)
          ELSE 0
        END AS taker_fee_quote_lots,
        CASE
          WHEN bytearray_substring(event_data, 1, 1) IN (${EVENTS.orderFilled}, ${EVENTS.splineFilled})
            THEN
              CAST(bytearray_to_bigint(bytearray_reverse(bytearray_substring(event_data, 27, 8))) AS DOUBLE)
              * (
                CASE
                  WHEN CAST(bytearray_to_uint256(bytearray_reverse(bytearray_substring(event_data, 75, 4))) AS DOUBLE) >= 2147483648
                    THEN CAST(bytearray_to_uint256(bytearray_reverse(bytearray_substring(event_data, 75, 4))) AS DOUBLE) - 4294967296
                  ELSE CAST(bytearray_to_uint256(bytearray_reverse(bytearray_substring(event_data, 75, 4))) AS DOUBLE)
                END
              )
              / 1e6
          ELSE 0
        END AS maker_fee_quote_lots
      FROM events
      WHERE bytearray_substring(event_data, 1, 1) IN (${EVENTS.tradeSummary}, ${EVENTS.orderFilled}, ${EVENTS.splineFilled})
    )
    SELECT
      COALESCE(SUM(taker_fee_quote_lots + maker_fee_quote_lots), 0) / 1e6 AS trading_fees_usd
    FROM decoded_fees
  `;

  const [res] = await queryDuneSql(options, query);
  const tradingFees = res.trading_fees_usd;
  dailyFees.addUSDValue(tradingFees, METRIC.TRADING_FEES);

  // not considering revenue as we arent counting referral and builder fees
  return {
    dailyFees,
  };
}

const methodology = {
  Fees: "Trading fees paid by users on perpetual positions.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.TRADING_FEES]: "Fees paid by traders on perpetual positions.",
  },
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.SOLANA],
  start: "2026-02-18",
  dependencies: [Dependencies.DUNE],
  isExpensiveAdapter: true,
  methodology,
  breakdownMethodology,
  skipBreakdownValidation: true,
};

export default adapter;
