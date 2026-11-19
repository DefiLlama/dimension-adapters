import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";
import { assertDuneSolanaIndexed } from "../../helpers/duneSolanaDex";
import { METRIC } from "../../helpers/metrics";

// Imperial's own perp book. Earlier Imperial volume was routed to Jupiter, Phoenix and Flash Trade
// and is already counted on those venues' listings.
const IMPERIAL_PROGRAM = "ARmavNtb6xs7SpH3geahw434fwTrVw5BSvJf36CAbWKB";

// First byte of the two operator-signed instructions that settle a trader fill: ACCEPT and PRIME_EXECUTE.
const ACCEPT = "0x04";
const PRIME_EXECUTE = "0x17";

const BUILDER_FEES = "Builder Fees To Integrators";

const ACCEPT_EVENT_TAG = "c25yQWNwdDE=";
const ACCEPT_EVENT_BYTES = 184;
const eventU64 = (offset: number) =>
  `IF(bytearray_length(payload) = ${ACCEPT_EVENT_BYTES}, CAST(bytearray_to_uint256(bytearray_reverse(bytearray_substring(payload, ${offset + 1}, 8))) AS DECIMAL(38,0)))`;

const sql = `
  WITH accept_lines AS (
    SELECT DISTINCT
      l.msg,
      IF(l.msg LIKE 'Program data:%', try(from_base64(split_part(l.msg, ' ', 4)))) AS payload
    FROM solana.instruction_calls s
    CROSS JOIN UNNEST(s.log_messages) AS l(msg)
    WHERE s.executing_account = '${IMPERIAL_PROGRAM}'
      AND s.tx_success
      AND bytearray_substring(s.data, 1, 1) IN (${ACCEPT}, ${PRIME_EXECUTE})
      AND (l.msg LIKE 'Program log: SunriseAccept %' OR l.msg LIKE 'Program data: ${ACCEPT_EVENT_TAG} %')
      AND TIME_RANGE
  ),
  fills AS (
    SELECT
      IF(payload IS NULL, CAST(regexp_extract(msg, ' filled_size_usd=([0-9]+)', 1) AS DECIMAL(38,0)), ${eventU64(16)}) AS notional,
      IF(payload IS NULL, CAST(regexp_extract(msg, ' fee=([0-9]+)', 1) AS DECIMAL(38,0)), ${eventU64(112)}) AS fee,
      IF(payload IS NULL, COALESCE(CAST(regexp_extract(msg, ' builder_fee=([0-9]+)', 1) AS DECIMAL(38,0)), 0), ${eventU64(120)}) AS builder_fee
    FROM accept_lines
  )
  SELECT
    COUNT(*) AS fills,
    count_if(notional IS NULL OR fee IS NULL) AS unparsed,
    SUM(notional) AS volume,
    SUM(fee) AS fees,
    SUM(builder_fee) AS builder_fees
  FROM fills
`;

const fetch = async (options: FetchOptions) => {
  assertDuneSolanaIndexed(options);

  const [row] = await queryDuneSql(options, sql);
  // Imperial has had fills every day since launch, so a day without any means Dune has not indexed it
  if (!row || !Number(row.fills)) throw new Error(`Imperial: no fills found for ${options.dateString}`);
  if (Number(row.unparsed)) throw new Error(`Imperial: ${row.unparsed} fill lines without a readable notional or fee on ${options.dateString}`);
  const volume = Number(row.volume) / 1e6;
  const platformFees = Number(row.fees) / 1e6;
  const builderFees = Number(row.builder_fees) / 1e6;

  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  dailyVolume.addUSDValue(volume);
  dailyFees.addUSDValue(platformFees, METRIC.TRADING_FEES);
  dailyFees.addUSDValue(builderFees, BUILDER_FEES);
  dailyRevenue.addUSDValue(platformFees, METRIC.TRADING_FEES);
  dailySupplySideRevenue.addUSDValue(builderFees, BUILDER_FEES);

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.SOLANA],
  start: "2026-09-16",
  dependencies: [Dependencies.DUNE],
  isExpensiveAdapter: true,
  methodology: {
    Volume:
      "Notional size of every trader fill on Imperial's perp markets (opens, increases and closes), read from the fill record each fill logs on Imperial's Solana program. Liquidations log a different record and are excluded. Each fill counts once.",
    Fees: "Imperial's trading fee on every open and close (0.5 bps of notional until September 22, 2026, 1 bps since), plus any builder fee an integrator adds to orders it submits, as charged on-chain in each fill's log record.",
    Revenue: "Imperial's trading fee on every open and close (0.5 bps of notional until September 22, 2026, 1 bps since).",
    ProtocolRevenue: "Imperial's trading fee on every open and close (0.5 bps of notional until September 22, 2026, 1 bps since), all kept by the protocol treasury.",
    SupplySideRevenue: "Builder fees paid to the integrators that submitted the orders.",
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.TRADING_FEES]: "Imperial's fee charged on the notional of each open and close: 0.5 bps until September 22, 2026, 1 bps since.",
      [BUILDER_FEES]: "Optional builder fee set by an integrator on orders it submits, capped at 10 bps of notional.",
    },
    Revenue: {
      [METRIC.TRADING_FEES]: "Imperial's trading fee: 0.5 bps until September 22, 2026, 1 bps since.",
    },
    ProtocolRevenue: {
      [METRIC.TRADING_FEES]: "Imperial's trading fee: 0.5 bps until September 22, 2026, 1 bps since.",
    },
    SupplySideRevenue: {
      [BUILDER_FEES]: "Builder fees paid out to integrators.",
    },
  },
};

export default adapter;
