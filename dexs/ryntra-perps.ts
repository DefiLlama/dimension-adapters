import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import ADDRESSES from "../helpers/coreAssets.json";
import { CHAIN } from "../helpers/chains";
import { queryDuneSql } from "../helpers/dune";
import { assertDuneSolanaIndexed } from "../helpers/duneSolanaDex";

// Ryntra Perps (https://ryntra.io/futures): perpetuals on Phoenix (https://phoenix.trade) traded inside Ryntra, the
// trading app of dexs/ryntra.ts. Every order Ryntra places is routed through Flight, Phoenix's builder-code proxy,
// naming Ryntra's builder. Flight takes the builder's fee only from the part of the order that takes liquidity (a
// post-only order or a maker fill pays none and adds no taker notional), moves it as collateral into the builder's
// Phoenix trader account, and logs the taker notional it found and the fee it moved at the end of the proxy call,
// e.g. 2TdKzFQqZr8d… (2026-10-22): "Program log: Found trade amount 96970888, collected fee: 19394" — $96.970888 of
// TSLA-PERP, 0.019394 USDC (2 bps).
// Phoenix settles in USDC, so both are USDC base units (6 decimals). The fee is read as Flight logged it, never derived
// from the builder's registered rate. Both addresses below are in Ryntra's public attribution registry
// (https://ryntra.io/api/stats/registry, drawn on https://ryntra.io/stats). Phoenix already lists this volume
// (dexs/phoenix-trade), so it is double counted.

const FLIGHT = "F1ightu9cujFYo34k9CabifLrJT8qzfDVM2Q7BqhJn2W";
// Phoenix's perpetuals program, the one Flight forwards the order to (dexs/phoenix-trade, fees/phoenix-trade).
const PHOENIX = "EtrnLzgbS7nMMy5fbD42kXiUzGg8XQzJ972Xtk1cjWih";
// Flight's ProxyInstruction discriminant (Phoenix Rise SDK, ts/src/flight/core/discriminants.ts).
const PROXY = "0x189a38686a082307";
// Ryntra's builder, registered with Flight on 2026-10-22 at 2 bps, and its Phoenix trader account. A proxy call names
// them as its third and fourth accounts (global state, Phoenix, builder, builder's trader account, builder state, trader);
// Phoenix as its second, so no other program's log line is read under the builder.
const BUILDER = "AAsopcXAB2WzeaTtCfuPS7nanGod8EefReaeVQCSopyN";
const BUILDER_TRADER_ACCOUNT = "4e2gmdF9VF4dLJB6DiLKmEfnYSJJMiDY8vUriroj6nqB";
const FLIGHT_FEE_LOG = "^Program log: Found trade amount ([0-9]+), collected fee: ([0-9]+)$";

// One row for the window. Dune's instruction_calls carries each instruction's own log lines (with those of the programs
// it calls, none of which logs this line), so a proxy call's line is its own; a proxy call that filled nothing (a TP/SL
// placed through Flight, e.g. 58m2MQEDuRCd…) writes no such line. element_at, not [], so a shorter Flight instruction
// reads as NULL instead of failing the query. Dune partitions instruction_calls by block_date and clusters it by
// executing_account_prefix; TIME_RANGE (block_time) prunes neither, so the scan carries both bounds (as fees/keep.ts).
// COUNT(*) always returns the row; a day with no matching line is a day without orders, and its sums are 0.
const query = ({ startTimestamp, endTimestamp }: FetchOptions) => `
    SELECT
      COUNT(*) AS orders,
      CAST(COALESCE(SUM(CAST(regexp_extract(l.msg, '${FLIGHT_FEE_LOG}', 1) AS DECIMAL(38, 0))), 0) AS VARCHAR) AS volume,
      CAST(COALESCE(SUM(CAST(regexp_extract(l.msg, '${FLIGHT_FEE_LOG}', 2) AS DECIMAL(38, 0))), 0) AS VARCHAR) AS fee
    FROM solana.instruction_calls i
    CROSS JOIN UNNEST(i.log_messages) AS l(msg)
    WHERE i.block_date >= CAST(from_unixtime(${startTimestamp}) AS DATE) AND i.block_date <= CAST(from_unixtime(${endTimestamp}) AS DATE)
      AND TIME_RANGE
      AND i.executing_account_prefix = '${FLIGHT.slice(0, 2)}'
      AND i.executing_account = '${FLIGHT}'
      AND i.tx_success = true
      AND bytearray_substring(i.data, 1, 8) = ${PROXY}
      AND element_at(i.account_arguments, 2) = '${PHOENIX}'
      AND element_at(i.account_arguments, 3) = '${BUILDER}'
      AND element_at(i.account_arguments, 4) = '${BUILDER_TRADER_ACCOUNT}'
      AND regexp_like(l.msg, '${FLIGHT_FEE_LOG}')
  `;

const LABELS = {
  BUILDER_FEES: "Phoenix Builder Fees",
  BUILDER_FEES_TO_RYNTRA: "Phoenix Builder Fees To Ryntra",
};

// The first day, as the chain holds it: three orders (2TdKzFQq…, 3tFUUeFM…, 3WRQCfAN…), 340.073239 USDC of taker
// notional, 0.068014 USDC of builder fees. They are Solana transactions of version 1 (SIMD-0385); a day that is known
// to have orders and comes back empty means the warehouse is missing them, and storing it as zero would hide that.
const FIRST_DAY = { start: 1792627200, end: 1792713600, orders: 3, volume: "340073239" }; // 2026-10-22 00:00 to 2026-10-23 00:00 UTC

const fetch = async (options: FetchOptions) => {
  assertDuneSolanaIndexed(options);
  const rows: { orders: number; volume: string; fee: string }[] = await queryDuneSql(options, query(options));
  // An aggregate always returns its row; none means the query did not answer, and a stored zero would hide that.
  if (rows.length !== 1) throw new Error(`ryntra-perps: expected one row from Dune, got ${rows.length}`);
  const [{ orders, volume, fee }] = rows;
  const firstDay = options.startTimestamp <= FIRST_DAY.start && options.endTimestamp >= FIRST_DAY.end && options.endTimestamp - options.startTimestamp <= 86_400 + 1;
  if (firstDay && (Number(orders) !== FIRST_DAY.orders || volume !== FIRST_DAY.volume))
    throw new Error(`ryntra-perps: Dune returns ${orders} Flight orders (${volume}) through Ryntra's builder on 2026-10-22, the chain holds ${FIRST_DAY.orders} (${FIRST_DAY.volume})`);

  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  dailyVolume.add(ADDRESSES.solana.USDC, volume);
  dailyFees.add(ADDRESSES.solana.USDC, fee, LABELS.BUILDER_FEES);
  dailyRevenue.add(ADDRESSES.solana.USDC, fee, LABELS.BUILDER_FEES_TO_RYNTRA);

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees.clone(),
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue.clone(),
  };
};

const methodology = {
  Volume: "Taker volume of Phoenix perpetuals orders placed through Ryntra. Double counted: Phoenix already lists this volume.",
  Fees: "The builder fee traders pay Ryntra on Phoenix perpetuals orders placed through it. Phoenix's own trading fees are not counted.",
  UserFees: "The builder fee traders pay Ryntra.",
  Revenue: "The whole builder fee.",
  ProtocolRevenue: "All of the revenue: Ryntra has no token.",
};

const breakdownMethodology = {
  Fees: {
    [LABELS.BUILDER_FEES]: "Ryntra's builder fee on Phoenix perpetuals orders.",
  },
  UserFees: {
    [LABELS.BUILDER_FEES]: "Ryntra's builder fee on Phoenix perpetuals orders.",
  },
  Revenue: {
    [LABELS.BUILDER_FEES_TO_RYNTRA]: "The whole builder fee, kept by Ryntra.",
  },
  ProtocolRevenue: {
    [LABELS.BUILDER_FEES_TO_RYNTRA]: "The whole builder fee, kept by Ryntra.",
  },
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.SOLANA],
  // The builder's first order through Flight (2TdKzFQq…, 2026-10-22 17:44 UTC); it was registered the same day.
  start: "2026-10-22",
  dependencies: [Dependencies.DUNE],
  isExpensiveAdapter: true,
  doublecounted: true,
  methodology,
  breakdownMethodology,
};

export default adapter;
