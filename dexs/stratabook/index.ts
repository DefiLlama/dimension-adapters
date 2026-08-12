/**
 * Stratabook (Strata DEX) — Solana CLOB + vault + Sonar aggregator.
 *
 * PR target: https://github.com/DefiLlama/dimension-adapters
 * Final path: `dexs/stratabook/index.ts`
 *
 * Data source: Dune Analytics (no Solana RPC). All on-chain events are
 * indexed by Dune's `solana.instruction_calls` table, which carries the
 * raw per-tx log messages for every program invocation.
 *
 * ── Protocol ───────────────────────────────────────────────────────
 *
 * Stratabook is a fully on-chain CLOB on Solana with three execution
 * layers, all settled by the same CLOB program
 * (`strataZWURmW6bzMWpkLCAFxNFrQXCNSE9cSmBmdPgP`):
 *
 *   L1 — native limit-order book fills        (source = 0)
 *   L2 — RFQ / MM-signed quote settlement     (source = 1)
 *   L3 — Sonar aggregator / AVL routed swaps  (source = 2, 4)
 *
 * Every match emits an `OrderFilled` event via `sol_log_data`:
 *
 *   Program data: <base64>   (100 bytes)
 *     [0]        tag          = 3 (EventTag::OrderFilled)  -> base64 prefix "Aw=="
 *     [1..33]    maker_pda
 *     [33..65]   taker_pda
 *     [65..73]   maker_order_id   (u64 LE)
 *     [73..81]   taker_order_id   (u64 LE)
 *     [81..89]   fill_size        (u64 LE, base-token atoms)
 *     [89..97]   settle_price     (u64 LE, quote atoms per base atom)
 *     [97]       source           (0=L1, 1=L2, 2=L3-AVL, 3=MEV, 4=L3-AVL-wrapped)
 *     [98..99]   maker_filled / taker_filled flags
 *
 * Volume = Σ fill_size (base side), minted to the base token via
 * `tokens_solana.transfers` (the base-side transfer amount equals
 * fill_size exactly — verified against live mainnet fills).
 *
 * ── Fees / Revenue methodology ─────────────────────────────────────
 *
 *   taker fee  = fill_size × Market.taker_fee_bps   (all sources)
 *   maker rebate = 0 (ships 0, never wired — no rebate paid today)
 *
 * The taker fee accrues inside the CLOB's escrow accounting (not as a
 * separate token transfer — maker/taker transfers are exactly equal and
 * opposite), so it is computed from fill_size × the market's configured
 * rate. Market fee config lives in market account data, which Dune does
 * not index for this program; the per-market taker_fee_bps map below was
 * read from live mainnet market accounts on 2026-08-12 (9 markets) and
 * must be extended when new markets launch.
 *
 *   dailyFees    = taker fee (what users pay)
 *   dailyRevenue = dailyFees (taker fee kept in full; maker rebate 0)
 *   dailyProtocolRevenue = dailyFees (supply-side revenue is 0)
 *   dailySupplySideRevenue = 0 (no LP incentives paid)
 */

import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";

const CLOB_PROGRAM = "strataZWURmW6bzMWpkLCAFxNFrQXCNSE9cSmBmdPgP";

// taker_fee_bps per market, read from live mainnet market accounts
// (dataSize=416, taker_fee_bps at offset 160) on 2026-08-12. Verified
// values are 5 or 10 bps across all 9 markets. Update when new markets
// launch (e.g. `gh api ...` GPA probe of the CLOB program).
const MARKET_TAKER_FEE_BPS: Record<string, number> = {
  "6cDuRk75Yd1247XCBCG8TCVksyyf43bUWdK7Vn7AhHhn": 5,
  "CmcjkZNVQHWw32tZGWo3sXSPVj6XyLdYQeHW1KKVFKTq": 10,
  "Dth4Lvf227CVy1TwUHsagZ3RSH2Qdua8c9xSQVk6vASu": 5,
  "EDXXti2SQqadtpBqeur1o1cakgmVeF21ePgSPCzC5udK": 10,
  "EqiJfyKDH1Z4kfCph8eFjYig6UXNgW6ypAAcUx4L1zX4": 10,
  "FLDpuWMW31G1jBdVhGVyoZnpvBSwJKeSdp5iYmZW9m1F": 10,
  "FyVFPaqq2ZM1ctKwd5AdpzQmK9GqwfooRfGLzKN61Uvh": 10,
  "G3uTbTDGFQrNwdvDNSCu2rQbSx4Ujfm75vgUdENR8h4J": 10,
  "GheWH6HirA15RX4hLTTbDEy3vZWHVAcVvUcPRtAwXng7": 10,
};
// SQL VALUES list generated from the map above — single source of truth.
const MARKET_FEE_VALUES = Object.entries(MARKET_TAKER_FEE_BPS)
  .map(([m, bps]) => `('${m}', ${bps})`)
  .join(",\n            ");

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  // Fills: CLOB invocations whose log messages carry an OrderFilled event
  // (tag 3 -> base64 payload starts "Aw=="). fill_size = u64 LE at byte 81
  // (1-indexed SQL byte 82). Each log line = one fill event; volume is
  // summed from events, so batch settles (2 fills/tx) count each once.
  // Base mint per tx = the token transfer whose amount equals a fill_size
  // (verified: the base-side transfer is 1:1 with the event's fill_size).
  // Market = the account-argument that is in our known market list, used
  // to look up taker_fee_bps.
  const sql = `
    WITH fills AS (
      SELECT
        s.tx_id,
        s.account_arguments,
        CAST(from_big_endian_64(reverse(SUBSTR(from_base64(SUBSTR(t.msg, 15)), 82, 8))) AS DOUBLE) AS fill_size
      FROM solana.instruction_calls s
      CROSS JOIN UNNEST(s.log_messages) AS t(msg)
      WHERE s.executing_account = '${CLOB_PROGRAM}'
        AND s.tx_success = true
        AND TIME_RANGE
        AND t.msg LIKE 'Program data: Aw==%'
        AND LENGTH(from_base64(SUBSTR(t.msg, 15))) >= 100
    ),
    mints AS (
      SELECT DISTINCT f.tx_id, tr.mint AS base_mint
      FROM fills f
      JOIN tokens_solana.transfers tr
        ON tr.tx_id = f.tx_id
       AND CAST(tr.amount AS DOUBLE) = f.fill_size
      WHERE TIME_RANGE
    )
    SELECT
      m.base_mint AS mint,
      SUM(f.fill_size) AS volume,
      SUM(f.fill_size) * COALESCE(
        (
          SELECT mk.fee_bps
          FROM (VALUES
            ${MARKET_FEE_VALUES}
          ) AS mk(market, fee_bps)
          WHERE ARRAY_CONTAINS(f.account_arguments, mk.market)
          LIMIT 1
        ), 10
      ) / 10000.0 AS fees
    FROM fills f
    JOIN mints m ON f.tx_id = m.tx_id
    GROUP BY m.base_mint
  `;

  const rows: any[] = await queryDuneSql(options, sql);

  for (const row of rows ?? []) {
    if (!row.mint || !row.volume) continue;
    dailyVolume.add(row.mint, String(Math.round(row.volume)));
    if (row.fees > 0) {
      const fees = String(Math.round(row.fees));
      dailyFees.add(row.mint, fees, "Swap Fees");
      dailyRevenue.add(row.mint, fees, "Swap Fees To Protocol");
      dailyProtocolRevenue.add(row.mint, fees, "Swap Fees To Protocol");
    }
  }

  return { dailyVolume, dailyFees, dailyRevenue, dailyProtocolRevenue, dailySupplySideRevenue };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  chains: [CHAIN.SOLANA],
  start: "2026-08-09", // first on-chain activity on the CLOB program
  fetch,
  dependencies: [Dependencies.DUNE],
  isExpensiveAdapter: true,
  methodology: {
    Volume:
      "Trading volume from on-chain OrderFilled events on the Stratabook CLOB program, " +
      "covering L1 orderbook, L2 RFQ, and L3 Sonar/AVL routed fills. Sum of base-side fill sizes, " +
      "USD-priced by DefiLlama. Sourced from Dune's solana.instruction_calls.",
    Fees:
      "Taker fee (Market.taker_fee_bps, 5 or 10 bps) on all fills. Maker rebate ships 0 and is not paid.",
    Revenue:
      "Taker fee kept in full (maker rebate ships 0 and is not paid).",
    ProtocolRevenue:
      "Taker fee retained by the protocol in full (supply-side revenue is 0, so all fees are protocol revenue).",
    SupplySideRevenue: "0 — no LP incentives paid.",
  },
  breakdownMethodology: {
    Fees: {
      "Swap Fees": "taker_fee_bps on all fills",
    },
    Revenue: {
      "Swap Fees To Protocol": "taker_fee_bps on all fills",
    },
    ProtocolRevenue: {
      "Swap Fees To Protocol": "taker_fee_bps on all fills",
    },
  },
};

export default adapter;
