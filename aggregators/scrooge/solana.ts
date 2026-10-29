import ADDRESSES from "../../helpers/coreAssets.json";
import { FetchOptions } from "../../adapters/types";
import { queryDuneSql } from "../../helpers/dune";
import { getEnv } from "../../helpers/env";

// Scrooge's swaps on Solana. Scrooge builds them on Jupiter's v6 program and has the trader pay Scrooge's fee in the
// swap's own transaction, either as SOL to Scrooge's Solana fee wallet or, on a swap to or from SOL, as Jupiter's
// platform fee in wrapped SOL to that wallet's wrapped-SOL token account. A successful transaction that ran Jupiter
// and grew either account's lamports is a Scrooge swap (the rule Scrooge's own statistics count by), read the way
// fees/axiom reads its fee wallets. Each is valued as aggregators/jupiter-aggregator values a Jupiter transaction:
// from the program's own swap events, once, at the amount the user put in.
const FEE_WALLET = "476HfMYteUageywESAe46syKCf5qoKRegqDc7rC8dgm9";
const FEE_TOKEN_ACCOUNT = "9o3QVkKC6PftJNPuDySZj4uS5PxZ7meUtT5FjjmJSTbW";
const JUP6 = "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4";
// Swaps on Solana went live on 2026-10-12.
export const SOLANA_START = "2026-10-12";

// Mints whose minute price is trusted to value a hop, preferred over the other side.
const MAJOR_MINTS = [ADDRESSES.solana.USDC, ADDRESSES.solana.USDT, ADDRESSES.solana.SOL];
const majors = MAJOR_MINTS.map((m) => `'${m}'`).join(", ");

// The JUP6 event decoding, the one-entry-per-transaction valuation and the parse check are those of
// aggregators/jupiter-aggregator, limited to the transactions that paid Scrooge's fee.
const query = (options: FetchOptions) => `
  WITH fee_payments AS (
    SELECT tx_id, SUM(balance_change) AS fee_lamports
    FROM solana.account_activity
    WHERE TIME_RANGE
      AND tx_success
      AND address IN ('${FEE_WALLET}', '${FEE_TOKEN_ACCOUNT}')
      AND balance_change > 0
    GROUP BY tx_id
  ),
  raw AS (
    SELECT tx_id, block_time, outer_instruction_index AS oi, inner_instruction_index AS ii, data
    FROM solana.instruction_calls
    WHERE TIME_RANGE
      AND tx_success
      AND is_inner
      AND executing_account_prefix = 'JU'
      AND executing_account = '${JUP6}'
      AND bytearray_substring(data, 1, 8) = from_hex('e445a52e51cb9a1d')
      AND bytearray_substring(data, 9, 8) IN (from_hex('40c6cde8260871e2'), from_hex('982f4eebc0606e6a'))
      AND tx_id IN (SELECT tx_id FROM fee_payments)
  ),
  swaps_batch AS (
    SELECT *, (length(data) - 20) / cnt AS sz
    FROM (
      SELECT *, CAST(bytearray_to_bigint(bytearray_reverse(bytearray_substring(data, 17, 4))) AS integer) AS cnt
      FROM raw
      WHERE bytearray_substring(data, 9, 8) = from_hex('982f4eebc0606e6a')
    )
    WHERE cnt > 0
  ),
  hops AS (
    SELECT tx_id, block_time, oi, ii, 0 AS k,
      to_base58(bytearray_substring(data, 49, 32)) AS imint,
      CAST(bytearray_to_uint256(bytearray_reverse(bytearray_substring(data, 81, 8))) AS double) AS iamt,
      to_base58(bytearray_substring(data, 89, 32)) AS omint,
      CAST(bytearray_to_uint256(bytearray_reverse(bytearray_substring(data, 121, 8))) AS double) AS oamt
    FROM raw
    WHERE bytearray_substring(data, 9, 8) = from_hex('40c6cde8260871e2') AND length(data) = 128
    UNION ALL
    SELECT tx_id, block_time, oi, ii, k,
      to_base58(bytearray_substring(data, 21 + k * sz, 32)),
      CAST(bytearray_to_uint256(bytearray_reverse(bytearray_substring(data, 53 + k * sz, 8))) AS double),
      to_base58(bytearray_substring(data, 61 + k * sz, 32)),
      CAST(bytearray_to_uint256(bytearray_reverse(bytearray_substring(data, 93 + k * sz, 8))) AS double)
    FROM swaps_batch
    CROSS JOIN UNNEST(sequence(0, cnt - 1)) AS u(k)
    WHERE length(data) - 20 = cnt * sz AND sz IN (80, 112)
  ),
  entry AS (
    SELECT tx_id, min_by(imint, CAST(oi AS bigint) * 1000000 + ii * 1000 + k) AS entry_mint
    FROM hops
    GROUP BY 1
  ),
  entry_hops AS (
    SELECT DISTINCT h.*
    FROM hops h
    JOIN entry e ON e.tx_id = h.tx_id AND e.entry_mint = h.imint
  ),
  px AS (
    SELECT contract_address_varchar AS mint, timestamp AS ts, price, decimals
    FROM prices.minute
    WHERE blockchain = 'solana'
      AND timestamp >= from_unixtime(${options.startTimestamp})
      AND timestamp < from_unixtime(${options.endTimestamp})
      AND contract_address_varchar IN (SELECT imint FROM entry_hops UNION SELECT omint FROM entry_hops)
  )
  SELECT
    SUM(
      CASE
        WHEN h.omint IN (${majors}) AND h.imint NOT IN (${majors})
          THEN coalesce(h.oamt / power(10, po.decimals) * po.price, h.iamt / power(10, pi.decimals) * pi.price)
        ELSE coalesce(h.iamt / power(10, pi.decimals) * pi.price, h.oamt / power(10, po.decimals) * po.price)
      END
    ) AS volume_usd,
    (SELECT SUM(fee_lamports) FROM fee_payments WHERE tx_id IN (SELECT tx_id FROM raw)) AS fee_lamports,
    (SELECT count(DISTINCT tx_id) FROM raw) AS swaps,
    (SELECT count(*) FROM raw) AS events,
    (SELECT count(*) FROM raw WHERE bytearray_substring(data, 9, 8) = from_hex('40c6cde8260871e2') AND length(data) <> 128)
      + (SELECT count(*) FROM swaps_batch WHERE length(data) - 20 <> cnt * sz OR sz NOT IN (80, 112)) AS unparsed_events
  FROM entry_hops h
  LEFT JOIN px pi ON pi.mint = h.imint AND pi.ts = date_trunc('minute', h.block_time)
  LEFT JOIN px po ON po.mint = h.omint AND po.ts = date_trunc('minute', h.block_time)
`;

/** A day's swaps through Scrooge on Solana: their worth in dollars and Scrooge's fee in lamports. */
export async function fetchSolanaSwaps(options: FetchOptions): Promise<{ volumeUsd: number; feeLamports: number }> {
  // Dune needs a key. A run without one (a pull request's CI has no secrets) counts nothing on Solana and says so, rather
  // than failing every chain.
  if (!getEnv("DUNE_API_KEYS")) {
    console.log("scrooge: DUNE_API_KEYS is not set, Solana is not counted");
    return { volumeUsd: 0, feeLamports: 0 };
  }
  // Dune indexes Solana with a delay, as aggregators/jupiter-aggregator allows for.
  if (options.toTimestamp * 1000 > Date.now() - 10 * 60 * 60 * 1000) throw new Error("End timestamp is less than 10 hours ago, skipping due to dune indexing delay");
  const [row] = await queryDuneSql(options, query(options));
  if (!row) throw new Error("scrooge: Dune query returned no row");
  // A JUP6 event layout change would drop events silently and under-count, so fail instead.
  if (row.unparsed_events > 0.001 * row.events) throw new Error(`scrooge: JUP6 events not parsed: ${row.unparsed_events} of ${row.events}`);
  return { volumeUsd: Number(row.volume_usd ?? 0), feeLamports: Number(row.fee_lamports ?? 0) };
}
