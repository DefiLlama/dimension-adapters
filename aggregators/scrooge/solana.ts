import { coins } from "@defillama/sdk";
import ADDRESSES from "../../helpers/coreAssets.json";
import { FetchOptions } from "../../adapters/types";
import { queryDuneSql } from "../../helpers/dune";
import { base58Encode } from "../../helpers/solana";

// Scrooge's swaps on Solana. Scrooge builds them on Jupiter's v6 program and has the trader pay Scrooge's fee in the
// swap's own transaction, either as SOL to Scrooge's Solana fee wallet or, on a swap to or from SOL, as Jupiter's
// platform fee in wrapped SOL to that wallet's wrapped-SOL token account. A successful transaction that ran Jupiter
// and grew either account's lamports is a Scrooge swap (the rule Scrooge's own statistics count by), read the way
// fees/axiom reads its fee wallets. Each is valued as aggregators/jupiter-aggregator values a Jupiter transaction:
// from the program's own swap events, once, at the amount the user put in.
// Scrooge's Solana fee wallet: the recipient of the fee transfer in the swaps Scrooge builds, e.g.
// https://solscan.io/tx/3pWeS6VFSfJqxohJt3xT5iCacSKmjv3m1auZRJ6XVhiYJ6CEKLbv1PRtfhTadmLHqbkTfn5c2wdK5hYaQrgcFdC1
const FEE_WALLET = "476HfMYteUageywESAe46syKCf5qoKRegqDc7rC8dgm9";
// The fee wallet's wrapped-SOL token account, where Jupiter pays its platform fee: getAccountInfo reads mint
// So11111111111111111111111111111111111111112, owner the fee wallet above, isNative true.
const FEE_TOKEN_ACCOUNT = "9o3QVkKC6PftJNPuDySZj4uS5PxZ7meUtT5FjjmJSTbW";
const JUP6 = "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4";
// Swaps on Solana went live on 2026-10-12.
export const SOLANA_START = "2026-10-12";

// Mints whose price is trusted to value a hop, preferred over the other side.
const MAJOR_MINTS = new Set([ADDRESSES.solana.USDC, ADDRESSES.solana.USDT, ADDRESSES.solana.SOL]);

// The JUP6 event layout and the one-entry-per-transaction valuation are those of aggregators/jupiter-aggregator (its
// layout notes at the top of aggregators/jupiter-aggregator/index.ts). JUP6 emits each pool hop as an Anchor event
// through a self-CPI, an inner instruction whose data is (byte offsets from 0):
// - 0-7: the Anchor event-CPI prefix e445a52e51cb9a1d; 8-15: the event's discriminator.
// - SwapEvent (40c6cde8260871e2), 128 bytes, one hop: amm (16), input_mint (48), input_amount as a little-endian u64
//   (80), output_mint (88), output_amount u64 (120).
// - SwapsEvent (982f4eebc0606e6a): a little-endian u32 count (16), then that many hops of sz bytes each from byte 20,
//   so sz = (length - 20) / count: input_mint (32), input_amount u64 (8), output_mint (32), output_amount u64 (8), and
//   the amm (32) where sz is 112 rather than 80.
const EVENT_CPI = "e445a52e51cb9a1d";
const SWAP_EVENT = "40c6cde8260871e2";
const SWAPS_EVENT = "982f4eebc0606e6a";

// Scrooge's transactions are found first, from what its fee accounts received (solana.account_activity prunes on
// address), and Jupiter's events are then read for those transactions only, by literal id. A single query filtering
// the events by a subquery on the fee payments read Jupiter's whole day of events, once per reference, and ran past
// Dune's time limit.
const feePaymentsQuery = `
  SELECT tx_id, SUM(balance_change) AS fee_lamports
  FROM solana.account_activity
  WHERE TIME_RANGE
    AND tx_success
    AND address IN ('${FEE_WALLET}', '${FEE_TOKEN_ACCOUNT}')
    AND balance_change > 0
  GROUP BY tx_id
`;

// instruction_calls is partitioned by block_date and clustered by executing_account_prefix: both bounds prune the scan
const eventsQuery = (options: FetchOptions, txIds: string[]) => `
  SELECT tx_id, outer_instruction_index AS oi, inner_instruction_index AS ii, to_hex(data) AS data
  FROM solana.instruction_calls
  WHERE TIME_RANGE
    AND block_date >= CAST(from_unixtime(${options.startTimestamp}) AS DATE)
    AND block_date <= CAST(from_unixtime(${options.endTimestamp} - 1) AS DATE)
    AND tx_success
    AND is_inner
    AND executing_account_prefix = 'JU'
    AND executing_account = '${JUP6}'
    AND bytearray_substring(data, 1, 8) = from_hex('${EVENT_CPI}')
    AND bytearray_substring(data, 9, 8) IN (from_hex('${SWAP_EVENT}'), from_hex('${SWAPS_EVENT}'))
    AND tx_id IN (${txIds.map((id) => `'${id}'`).join(", ")})
`;

type Hop = { order: number; imint: string; iamt: bigint; omint: string; oamt: bigint };

// One event's hops, ordered within the transaction by instruction and hop; undefined where its layout is not one of
// the two above. A SwapsEvent with a count of 0 has no hops.
const decodeHops = (data: Buffer, order: number): Hop[] | undefined => {
  const hop = (at: number, k: number): Hop => ({
    order: order + k,
    imint: base58Encode(data.subarray(at, at + 32)),
    iamt: data.readBigUInt64LE(at + 32),
    omint: base58Encode(data.subarray(at + 40, at + 72)),
    oamt: data.readBigUInt64LE(at + 72),
  });
  if (data.subarray(8, 16).toString("hex") === SWAP_EVENT) return data.length === 128 ? [hop(48, 0)] : undefined;
  if (data.length < 20) return undefined;
  const count = data.readUInt32LE(16);
  if (count === 0) return [];
  const size = (data.length - 20) / count;
  if (size !== 80 && size !== 112) return undefined;
  return Array.from({ length: count }, (_, k) => hop(20 + k * size, k));
};

/** A day's swaps through Scrooge on Solana: the token each was valued in with its raw amount, and Scrooge's fee in lamports. */
export async function fetchSolanaSwaps(options: FetchOptions): Promise<{ volume: { mint: string; amount: bigint }[]; feeLamports: number }> {
  // Dune's Solana indexing delay is checked in the adapter's prefetch (./index.ts), before any chain runs.
  // extraUIDKey keeps DUNE_BULK_MODE from UNION ALLing the two queries, whose columns differ
  const payments = await queryDuneSql(options, feePaymentsQuery, { extraUIDKey: "scrooge-fee-payments" });
  if (!payments.length) return { volume: [], feeLamports: 0 };
  const events = await queryDuneSql(options, eventsQuery(options, payments.map((p: any) => p.tx_id)), { extraUIDKey: "scrooge-jup6-events" });

  const hopsByTx: Record<string, Hop[]> = {};
  const seen = new Set<string>();
  let unparsed = 0;
  for (const { tx_id, oi, ii, data } of events) {
    const key = `${tx_id}:${oi}:${ii}`;
    if (seen.has(key)) continue;
    seen.add(key);
    hopsByTx[tx_id] ??= [];
    const hops = decodeHops(Buffer.from(data.replace(/^0x/i, ""), "hex"), oi * 1e6 + ii * 1e3);
    if (hops) hopsByTx[tx_id].push(...hops);
    else unparsed++;
  }
  // A JUP6 event layout change would drop events silently and under-count, so fail instead: more than 0.1% of the
  // events not parsed (the limit aggregators/jupiter-aggregator uses) fails the day.
  if (unparsed > 0.001 * seen.size) throw new Error(`scrooge: JUP6 events not parsed: ${unparsed} of ${seen.size}`);

  // Each transaction is valued once, on the input mint of its first hop: every hop selling that mint is counted (a
  // route split across pools in full) and the intermediate hops are not.
  const entryHops: Hop[] = [];
  for (const hops of Object.values(hopsByTx)) {
    if (!hops.length) continue;
    const entryMint = hops.reduce((first, h) => (h.order < first.order ? h : first)).imint;
    entryHops.push(...hops.filter((h) => h.imint === entryMint));
  }
  // A hop is valued on its output where only the output is a major mint, otherwise on its input, and on the other side
  // where DefiLlama has no price for that one (as aggregators/jupiter-aggregator falls back to the other side's price):
  // a new coin sold into another unlisted token is valued on what it bought.
  const keys = [...new Set(entryHops.flatMap((h) => [h.imint, h.omint]))].map((mint) => `solana:${mint}`);
  const prices = keys.length ? await coins.getPrices(keys, options.endTimestamp) : {};
  const priced = (mint: string) => !!prices[`solana:${mint}`];
  const volume: { mint: string; amount: bigint }[] = [];
  for (const h of entryHops) {
    const input = { mint: h.imint, amount: h.iamt };
    const output = { mint: h.omint, amount: h.oamt };
    const [first, second] = MAJOR_MINTS.has(h.omint) && !MAJOR_MINTS.has(h.imint) ? [output, input] : [input, output];
    volume.push(priced(first.mint) || !priced(second.mint) ? first : second);
  }
  // Scrooge's fee, on the transactions that ran Jupiter
  const feeLamports = payments.filter((p: any) => hopsByTx[p.tx_id]).reduce((sum: number, p: any) => sum + Number(p.fee_lamports), 0);
  return { volume, feeLamports };
}
