import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryAllium } from "../../helpers/allium";
import { METRIC } from "../../helpers/metrics";

const PHOENIX_PERPS_PROGRAM = "phDEVv4w6BcfkLrLNeXr8HhhgQxnxziVGXpGPcaadMf";
const EVENTS = {
  log: "8de6d6f209d1cfaa",
  logEventLengths: "f70786cbb5479947",
  orderFilled: "03",
  splineFilled: "05",
  tradeSummary: "06",
};
const ALLIUM_HEX_TO_INT_LE = "common.udfs.js_hextoint_littleendian_secure";

async function fetch(options: FetchOptions) {
  const dailyFees = options.createBalances();

  const query = `
    WITH logs AS (
      SELECT
        *
      FROM (
        SELECT
          txn_id,
          instruction_index,
          inner_instruction_index,
          common.udfs.js_base58_to_hex_secure(data) AS hex_data
        FROM solana.raw.success_nonvoting_inner_instructions
        WHERE block_timestamp >= TO_TIMESTAMP_NTZ(${options.startTimestamp})
          AND block_timestamp < TO_TIMESTAMP_NTZ(${options.endTimestamp})
          AND program_id = '${PHOENIX_PERPS_PROGRAM}'
      ) decoded
      WHERE SUBSTR(hex_data, 1, 16) IN ('${EVENTS.log}', '${EVENTS.logEventLengths}')
    ),
    batches AS (
      SELECT
        l.txn_id,
        l.instruction_index,
        l.inner_instruction_index,
        l.hex_data AS log_data,
        e.hex_data AS lengths_data,
        ${ALLIUM_HEX_TO_INT_LE}('0x' || SUBSTR(e.hex_data, 25, 8))::INT AS event_count
      FROM logs l
      JOIN logs e
        ON l.txn_id = e.txn_id
        AND l.instruction_index = e.instruction_index
        AND l.inner_instruction_index = e.inner_instruction_index + 1
      WHERE SUBSTR(l.hex_data, 1, 16) = '${EVENTS.log}'
        AND SUBSTR(e.hex_data, 1, 16) = '${EVENTS.logEventLengths}'
    ),
    lengths AS (
      SELECT
        b.*,
        f.value::INT AS event_index,
        ${ALLIUM_HEX_TO_INT_LE}('0x' || SUBSTR(lengths_data, 33 + f.value::INT * 4, 4))::INT AS event_len
      FROM batches b
      , LATERAL FLATTEN(input => ARRAY_GENERATE_RANGE(0, event_count)) f
    ),
    events AS (
      SELECT
        SUBSTR(
          log_data,
          33 + 2 * COALESCE(
            SUM(event_len) OVER (
              PARTITION BY txn_id, instruction_index, inner_instruction_index
              ORDER BY event_index
              ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
            ),
            0
          ),
          event_len * 2
        ) AS event_data
      FROM lengths
    ),
    fee_events AS (
      SELECT
        SUBSTR(event_data, 1, 2) AS event_type,
        ${ALLIUM_HEX_TO_INT_LE}('0x' || SUBSTR(event_data, 133, 16))::DOUBLE AS taker_fee_quote_lots,
        ${ALLIUM_HEX_TO_INT_LE}('0x' || SUBSTR(event_data, 53, 16))::DOUBLE AS quote_lots_filled,
        ${ALLIUM_HEX_TO_INT_LE}('0x' || SUBSTR(event_data, 149, 8))::DOUBLE AS maker_fee_rate_raw
      FROM events
      WHERE SUBSTR(event_data, 1, 2) IN ('${EVENTS.tradeSummary}', '${EVENTS.orderFilled}', '${EVENTS.splineFilled}')
    )
    SELECT
      COALESCE(SUM(
        IFF(
          event_type = '${EVENTS.tradeSummary}',
          taker_fee_quote_lots,
          quote_lots_filled * IFF(maker_fee_rate_raw >= 2147483648, maker_fee_rate_raw - 4294967296, maker_fee_rate_raw) / 1e6
        )
      ), 0) / 1e4 AS trading_fees_usd
    FROM fee_events
  `;

  const [res] = await queryAllium(query);
  const tradingFees = res?.trading_fees_usd ?? 0;
  dailyFees.addUSDValue(tradingFees, METRIC.TRADING_FEES);

  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  };
}

const methodology = {
  Fees: "Trading fees paid by users on perpetual positions.",
  Revenue: "All trading fees are counted as protocol revenue.",
  ProtocolRevenue: "All trading fees go to the protocol.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.TRADING_FEES]: "Fees paid by traders on perpetual positions.",
  },
  Revenue: {
    [METRIC.TRADING_FEES]: "All trading fees are counted as protocol revenue.",
  },
  ProtocolRevenue: {
    [METRIC.TRADING_FEES]: "All trading fees go to the protocol.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.SOLANA],
  start: "2025-11-18",
  dependencies: [Dependencies.ALLIUM],
  isExpensiveAdapter: true,
  methodology,
  breakdownMethodology,
};

export default adapter;
