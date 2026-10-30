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

// Every fill logs one plain-text line, all amounts in micro-USD:
//   Program log: SunriseAccept id=<request id> ... filled_size_usd=<notional> ... fee=<imperial fee> ... builder_fee=<builder fee> ...
// Liquidations log SunriseLiquidate instead, so they are not counted as volume.
// `id` is the request id, which the program settles at most once, so it dedupes the fill.
const sql = `
  WITH accept_lines AS (
    SELECT DISTINCT
      regexp_extract(l.msg, ' id=([0-9]+)', 1) AS request_id,
      CAST(regexp_extract(l.msg, ' filled_size_usd=([0-9]+)', 1) AS DECIMAL(38,0)) AS notional,
      CAST(regexp_extract(l.msg, ' fee=([0-9]+)', 1) AS DECIMAL(38,0)) AS fee,
      CAST(regexp_extract(l.msg, ' builder_fee=([0-9]+)', 1) AS DECIMAL(38,0)) AS builder_fee
    FROM solana.instruction_calls s
    CROSS JOIN UNNEST(s.log_messages) AS l(msg)
    WHERE s.executing_account = '${IMPERIAL_PROGRAM}'
      AND s.tx_success
      AND bytearray_substring(s.data, 1, 1) IN (${ACCEPT}, ${PRIME_EXECUTE})
      AND l.msg LIKE 'Program log: SunriseAccept %'
      AND TIME_RANGE
  )
  SELECT
    COALESCE(SUM(notional), 0) AS volume,
    COALESCE(SUM(fee), 0) AS fees,
    COALESCE(SUM(builder_fee), 0) AS builder_fees
  FROM accept_lines
`;

const fetch = async (options: FetchOptions) => {
  assertDuneSolanaIndexed(options);

  const [row] = await queryDuneSql(options, sql);
  const volume = Number(row?.volume ?? 0) / 1e6;
  const platformFees = Number(row?.fees ?? 0) / 1e6;
  const builderFees = Number(row?.builder_fees ?? 0) / 1e6;

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
      "Notional size of every trader fill on Imperial's perp markets (opens, increases and closes), read from the SunriseAccept log each fill emits on Imperial's Solana program. Liquidations emit a different log and are excluded. Each fill counts once.",
    Fees: "Imperial's 1 bps trading fee on every open and close, plus any builder fee an integrator adds to orders it submits, as charged on-chain in each fill's SunriseAccept log.",
    Revenue: "Imperial's 1 bps trading fee.",
    ProtocolRevenue: "Imperial's 1 bps trading fee, all kept by the protocol treasury.",
    SupplySideRevenue: "Builder fees paid to the integrators that submitted the orders.",
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.TRADING_FEES]: "Imperial's 1 bps fee charged on the notional of each open and close.",
      [BUILDER_FEES]: "Optional builder fee set by an integrator on orders it submits, capped at 10 bps of notional.",
    },
    Revenue: {
      [METRIC.TRADING_FEES]: "Imperial's 1 bps trading fee.",
    },
    ProtocolRevenue: {
      [METRIC.TRADING_FEES]: "Imperial's 1 bps trading fee.",
    },
    SupplySideRevenue: {
      [BUILDER_FEES]: "Builder fees paid out to integrators.",
    },
  },
};

export default adapter;
