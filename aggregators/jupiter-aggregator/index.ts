import { CHAIN } from "../../helpers/chains";
import { Dependencies, FetchOptions } from "../../adapters/types";
import { queryDuneSql } from "../../helpers/dune";

const JUP6_EVENTS_START = '2025-09-01'; //aggregator_swaps coverage incomplete from here

// JUP6 emits one anchor event per pool hop, as a self-CPI with the anchor event prefix
// e445a52e51cb9a1d. SwapEvent (40c6cde8260871e2) carries one hop:
//   amm(32) input_mint(32) input_amount(u64) output_mint(32) output_amount(u64)
// SwapsEvent (982f4eebc0606e6a) carries a u32 count, then that many hops of
//   input_mint(32) input_amount(u64) output_mint(32) output_amount(u64) [amm(32)]
// Reading the router's own events covers every AMM Jupiter routes through, unlike
// dex_solana.trades, which only has rows for AMMs Dune decodes.
const JUP6 = 'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4';

// Mints whose minute price is trusted to value a hop, preferred over the other side.
const MAJOR_MINTS = [
  'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
  'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', // USDT
  'So11111111111111111111111111111111111111112', // wSOL
];

const eventsQuery = (options: FetchOptions) => `
  WITH raw AS (
    SELECT tx_id, block_time, outer_instruction_index AS oi, inner_instruction_index AS ii, data
    FROM solana.instruction_calls
    WHERE TIME_RANGE
      AND tx_success
      AND is_inner
      AND executing_account_prefix = 'JU'
      AND executing_account = '${JUP6}'
      AND bytearray_substring(data, 1, 8) = from_hex('e445a52e51cb9a1d')
      AND bytearray_substring(data, 9, 8) IN (from_hex('40c6cde8260871e2'), from_hex('982f4eebc0606e6a'))
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
  -- Each transaction is valued once, on the input mint of its first hop. Summing every hop
  -- that sells that mint counts split routes in full and skips the intermediate hops, so
  -- the swap is valued at the amount the user put in. A Solana transaction is signed by
  -- its trader, so one per transaction is one per (tx, trader); two JUP6 swaps by the
  -- same trader in one transaction merge into one, per dexs/AGENTS.md.
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
  SELECT SUM(
    CASE
      WHEN h.omint IN (${MAJOR_MINTS.map(m => `'${m}'`).join(', ')}) AND h.imint NOT IN (${MAJOR_MINTS.map(m => `'${m}'`).join(', ')})
        THEN h.oamt / power(10, po.decimals) * po.price
      ELSE coalesce(h.iamt / power(10, pi.decimals) * pi.price, h.oamt / power(10, po.decimals) * po.price)
    END
  ) AS volume_24,
    (SELECT count(*) FROM raw) AS events,
    (SELECT count(*) FROM raw WHERE bytearray_substring(data, 9, 8) = from_hex('40c6cde8260871e2') AND length(data) <> 128)
      + (SELECT count(*) FROM swaps_batch WHERE length(data) - 20 <> cnt * sz OR sz NOT IN (80, 112)) AS unparsed_events
  FROM entry_hops h
  LEFT JOIN px pi ON pi.mint = h.imint AND pi.ts = date_trunc('minute', h.block_time)
  LEFT JOIN px po ON po.mint = h.omint AND po.ts = date_trunc('minute', h.block_time)
`;

const legacyQuery = (options: FetchOptions) => `
  SELECT sum(COALESCE(input_usd, output_usd)) as volume_24
  FROM jupiter_solana.aggregator_swaps
  WHERE block_time >= from_unixtime(${options.startTimestamp}) AND block_time < from_unixtime(${options.endTimestamp})
`;

const fetch = async (options: FetchOptions) => {
  const useEvents = options.dateString >= JUP6_EVENTS_START;
  if (useEvents) {
    const now = Date.now();
    const tenHoursAgo = now - 10 * 60 * 60 * 1000;
    if (options.toTimestamp * 1000 > tenHoursAgo) {
      throw new Error("End timestamp is less than 10 hours ago, skipping due to dune indexing delay");
    }
  }
  const sql = useEvents ? eventsQuery(options) : legacyQuery(options);
  const data = await queryDuneSql(options, sql);

  const chainData = data[0];
  if (!chainData || chainData.volume_24 == null) throw new Error(`Dune query failed: ${JSON.stringify(data)}`);
  // A JUP6 event layout change would drop events silently and under-count, so fail instead.
  if (useEvents && chainData.unparsed_events > 0.001 * chainData.events)
    throw new Error(`JUP6 events not parsed: ${chainData.unparsed_events} of ${chainData.events}`);
  return {
    dailyVolume: chainData.volume_24
  };
};

const adapter: any = {
  version: 1,
  dependencies: [Dependencies.DUNE],
  fetch,
  start: '2023-04-16',
  methodology: {
    Volume:
      "Volume of swaps routed through the Jupiter v6 aggregator program on Solana, each transaction counted once at the amount the user put in, with split routes counted in full and intermediate hops left out. From 2025-09 read from the program's own swap events; earlier dates use jupiter_solana.aggregator_swaps, whose coverage is incomplete from that point.",
  },
  chains: [CHAIN.SOLANA],
};

export default adapter;
