// Parchment perps on Sui (https://parchment.trade). Shared by dexs/parchment, fees/parchment and open-interest/parchment.
// Contracts: https://docs.parchment.trade/contracts , fees: https://docs.parchment.trade/trading/fees
import { PromisePool } from "@supercharge/promise-pool";
import ADDRESSES from "./coreAssets.json";
import { getObject, graphqlCall, queryEvents } from "./sui";

// Core `parchment` package. Every Parchment event is emitted as `<CORE>::events::Event<<CORE>::events::X>`.
// Sui keys a type on the package that first defined it, so these strings survive in-place upgrades of the
// package; a new event struct added by an upgrade would carry the upgraded package id instead.
export const PARCHMENT_CORE = "0xb4d5d077a8997f8dcbfefe36dd61ec8f26dfa0f789ba83e81e55252fd30eb3a2";
// The single USDC Exchange (shared object). Created 2026-11-03, first trade 2026-11-03, public launch 2026-11-06.
export const PARCHMENT_EXCHANGE = "0xbe3c5d2d066c8ec04b4f280fab7c560f78deff91c7abcbdb38a750b797c29c82";
// Collateral of every market and the vault: native Circle USDC (6 decimals).
export const PARCHMENT_USDC = ADDRESSES.sui.USDC_CIRCLE;
export const PARCHMENT_START = "2026-11-03";
// Sui framework package (`0x2`, which defines `dynamic_field::Field`), in the full-length form GraphQL type reprs use.
const SUI_FRAMEWORK = "0x0000000000000000000000000000000000000000000000000000000000000002";

const eventType = (name: string) => `${PARCHMENT_CORE}::events::Event<${PARCHMENT_CORE}::events::${name}>`;

// Events of one type in the half-open window [start, end), unwrapped from the `Event<T>` envelope (`pos0`).
export async function getParchmentEvents(name: string, startTimestamp: number, endTimestamp: number): Promise<any[]> {
  return queryEvents({
    eventType: eventType(name),
    options: { startTimestamp, endTimestamp },
    transform: (e: any) => e.pos0 ?? e,
  });
}

// Events that carry `exchange_id` are filtered to the Parchment USDC Exchange.
export const isParchmentExchange = (e: any) => e.exchange_id === PARCHMENT_EXCHANGE;

// Markets of the Parchment Exchange with their current state. Markets are discovered from their creation events
// (`CreateMarketEventV1` carries only `market_id`) and kept if their state names the Parchment Exchange; a market's
// exchange is fixed at creation.
export async function getParchmentMarkets(endTimestamp: number): Promise<{ marketId: string; state: any }[]> {
  const created = await getParchmentEvents("CreateMarketEventV1", Date.parse(PARCHMENT_START) / 1e3, endTimestamp);
  const { results } = await PromisePool.withConcurrency(5)
    .for(created)
    .handleError((error) => { throw error; })
    .process(async ({ market_id }: any) => ({ marketId: market_id as string, state: await getVersionedState(market_id) }));
  return results.filter(({ state }) => state.exchange_id === PARCHMENT_EXCHANGE);
}

// Events that carry only `market_id` (opens, liquidations, orders) are filtered to the markets of the Parchment Exchange.
export function parchmentMarketFilter(markets: { marketId: string }[]): (e: any) => boolean {
  const ids = new Set(markets.map(({ marketId }) => marketId));
  return (e: any) => ids.has(e.market_id);
}

export async function getParchmentMarketFilter(endTimestamp: number): Promise<(e: any) => boolean> {
  return parchmentMarketFilter(await getParchmentMarkets(endTimestamp));
}

// Closes (user, keeper-filled and session force closes, full or partial; one `CloseFeesEventV2` per settled close) of
// the Parchment Exchange in [start, end), with their closed notional in USDC base units. The close event carries no
// size, so the size is read from the position's state around the close transaction: each position is a
// `Field<u64, account::Position>` in its Account's positions table, and the transaction effects keep that object's
// input state (before the transaction) and output state (after it). See `closedNotionals`.
export async function getParchmentCloses(startTimestamp: number, endTimestamp: number): Promise<{ closes: any[]; notional: bigint }[]> {
  const closes = (await getParchmentTxEvents("CloseFeesEventV2", startTimestamp, endTimestamp))
    .filter(({ event }) => isParchmentExchange(event));
  return closedNotionals(closes, await getObjectChanges([...new Set(closes.map(({ digest }) => digest))]));
}

// Closed notional per (transaction, position), from the position's `Field<u64, account::Position>` in that
// transaction's object changes:
// - a full close deletes the field: the closed notional is the input state's `notional`;
// - a partial close (Trade Cards, not live yet) splits a slice off and puts the rest back under the same key, so the
//   field is mutated: the closed notional is input `notional` - output `notional` (the slice is
//   floor(notional * close_bps / 1e4) and the rest keeps the remainder, so the two add up exactly).
// Several closes of one position in one transaction (slices, then possibly the rest) are summed this way as a group.
// Each close charge is floor(slice notional * close_fee_ppm / 1e6) with the rate stamped on the position at open (kept
// on every slice), so a group of k closes over a total notional N must charge between floor(N * ppm / 1e6) - (k - 1)
// and floor(N * ppm / 1e6), exactly that for a single close. A close whose position field is missing (or created) in
// its transaction's effects, or that fails the charge check, fails the run rather than being dropped. (A position
// opened and closed in one transaction would have no input state, but opens are keeper fills of an earlier request
// and a close needs an existing position.)
export const POSITION_FIELD = `${SUI_FRAMEWORK}::dynamic_field::Field<u64,${PARCHMENT_CORE}::account::Position>`;
export function closedNotionals(
  closes: { event: any; digest: string }[],
  changes: Map<string, any[]>, // digest => `objectChanges.nodes`
): { closes: any[]; notional: bigint }[] {
  const groups = new Map<string, { digest: string; positionId: string; closes: any[] }>();
  for (const { event, digest } of closes) {
    const key = `${digest}:${event.position_id}`;
    if (!groups.has(key)) groups.set(key, { digest, positionId: String(event.position_id), closes: [] });
    groups.get(key)!.closes.push(event);
  }
  return [...groups.values()].map(({ digest, positionId, closes }) => {
    const fields = (changes.get(digest) ?? []).filter(({ inputState }) => {
      const contents = inputState?.asMoveObject?.contents;
      return contents?.type?.repr === POSITION_FIELD && String(contents.json.name) === positionId;
    });
    if (fields.length !== 1) throw new Error(`Parchment: ${fields.length} prior states of position ${positionId} in the effects of close ${digest}`);
    const [{ idDeleted, inputState, outputState }] = fields;
    const before = inputState.asMoveObject.contents.json.value;
    const after = outputState?.asMoveObject?.contents;
    if (!idDeleted && after?.type?.repr !== POSITION_FIELD) throw new Error(`Parchment: position ${positionId} neither deleted nor kept by close ${digest}`);
    const notional = BigInt(before.notional) - (idDeleted ? 0n : BigInt(after.json.value.notional));
    const charged = closes.reduce((sum, close) => sum + BigInt(close.close_charge), 0n);
    const expected = (notional * BigInt(before.close_fee_ppm)) / 1_000_000n;
    if (notional <= 0n || charged > expected || charged < expected - BigInt(closes.length - 1))
      throw new Error(`Parchment: close charge ${charged} of position ${positionId} (${digest}, ${closes.length} closes) does not match closed notional ${notional} at ${before.close_fee_ppm} ppm`);
    return { closes, notional };
  });
}

// Events of one type in [start, end) with their transaction digest and their index in that transaction
// (`sequenceNumber`), unwrapped like `getParchmentEvents`. Same backwards walk from the newest event as `queryEvents`,
// which returns neither.
export type ParchmentTxEvent = { event: any; digest: string; seq: number };
export async function getParchmentTxEvents(name: string, startTimestamp: number, endTimestamp: number): Promise<ParchmentTxEvent[]> {
  const type = eventType(name);
  const items: ParchmentTxEvent[] = [];
  let before: string | null = null;
  do {
    const data = await graphqlCall(`query ($type: String!, $before: String) {
      events(last: 50, before: $before, filter: { type: $type }) {
        pageInfo { hasPreviousPage startCursor } nodes { timestamp sequenceNumber transaction { digest } contents { json } }
      }
    }`, { type, before });
    const { pageInfo, nodes } = data.events; // oldest first
    before = pageInfo.hasPreviousPage && nodes.length ? pageInfo.startCursor : null;
    for (let i = nodes.length - 1; i >= 0; i--) {
      const ts = Date.parse(nodes[i].timestamp) / 1e3;
      if (ts >= endTimestamp) continue;
      if (ts < startTimestamp) { before = null; break; }
      const digest = nodes[i].transaction?.digest;
      if (!digest || nodes[i].sequenceNumber == null) throw new Error(`Parchment: ${name} event without a transaction digest or index`);
      items.push({ event: nodes[i].contents.json.pos0, digest, seq: Number(nodes[i].sequenceNumber) });
    }
  } while (before);
  return items.reverse();
}

// Matches each queued payout (`EnqueuePayoutEventV2`) to its close (`CloseFeesEventV2`) and returns, per close, the fee
// queued with its claim (0n when the close was not queued). A queued close emits its enqueue event before its close
// fees event in the same transaction, so each close takes the enqueue of the same position emitted after the
// previous close of that position in that transaction; this keeps several closes of one position in one transaction
// (partial closes) apart. An enqueue left without its close fails the run.
export function matchQueuedFees(closes: ParchmentTxEvent[], enqueues: ParchmentTxEvent[]): bigint[] {
  const tagged = [
    ...enqueues.map((e) => ({ ...e, close: -1 })),
    ...closes.map((e, i) => ({ ...e, close: i })),
  ].sort((a, b) => (a.digest === b.digest ? a.seq - b.seq : a.digest < b.digest ? -1 : 1));
  const pending = new Map<string, any>();
  const queued = closes.map(() => 0n);
  for (const { event, digest, close } of tagged) {
    const key = `${digest}:${event.position_id}`;
    if (close < 0) {
      if (pending.has(key)) throw new Error(`Parchment: two queued payouts of position ${event.position_id} before its close in ${digest}`);
      pending.set(key, event);
    } else if (pending.has(key)) {
      queued[close] = BigInt(pending.get(key).fee);
      pending.delete(key);
    }
  }
  for (const [key] of pending) throw new Error(`Parchment: queued payout ${key} without its close`);
  return queued;
}

// Fees a close collects at the close, net of the referee discount, by kind. `queuedFee` is the fee queued with the
// close's claim (`matchQueuedFees`). A close collects its close charge and win fee (`collected`), except the part
// queued with a winning claim (`EnqueuePayoutEventV2.fee` = win fee + the part of the close charge taken from
// profit), which is collected at harvest. The referee discount is a share of `collected` credited back to the trader
// at once, so it is a fee the trader does not pay: it is netted from the close and win fees in proportion (rounding
// to the close fee). The loss fee carries no discount.
export function closeFeesCollected(close: any, queuedFee: bigint): { close: bigint; win: bigint; loss: bigint } {
  const win = BigInt(close.win_fee);
  const queuedWin = queuedFee < win ? queuedFee : win;
  const closeNow = BigInt(close.close_charge) - (queuedFee - queuedWin);
  const winNow = win - queuedWin;
  const discount = BigInt(close.referral_discount);
  if (closeNow < 0n || discount > closeNow + winNow)
    throw new Error(`Parchment: queued fee ${queuedFee} / discount ${discount} above the fees of close ${close.position_id}`);
  const winDiscount = closeNow + winNow > 0n ? (discount * winNow) / (closeNow + winNow) : 0n;
  return { close: closeNow - (discount - winDiscount), win: winNow - winDiscount, loss: BigInt(close.loss_fee) };
}

// `objectChanges.nodes` (with input and output states) of the given transactions, by digest. 50 transactions per
// `multiGetTransactionEffects` call (limit 200); a close transaction changes ~25 objects, far below the 1024 object
// changes read per transaction, and a transaction with more fails the run.
async function getObjectChanges(digests: string[]): Promise<Map<string, any[]>> {
  const chunks: string[][] = [];
  for (let i = 0; i < digests.length; i += 50) chunks.push(digests.slice(i, i + 50));
  const changes = new Map<string, any[]>();
  await PromisePool.withConcurrency(3)
    .for(chunks)
    .handleError((error) => { throw error; })
    .process(async (keys) => {
      const data = await graphqlCall(`query ($keys: [String!]!) {
        multiGetTransactionEffects(keys: $keys) { digest objectChanges(first: 1024) {
          pageInfo { hasNextPage } nodes {
            idDeleted
            inputState { asMoveObject { contents { type { repr } json } } }
            outputState { asMoveObject { contents { type { repr } json } } }
          }
        } }
      }`, { keys });
      const effects = data?.multiGetTransactionEffects ?? [];
      keys.forEach((digest, i) => {
        const tx = effects[i];
        if (tx?.digest !== digest) throw new Error(`Parchment: effects of transaction ${digest} not found`);
        if (tx.objectChanges.pageInfo.hasNextPage) throw new Error(`Parchment: more than 1024 object changes in transaction ${digest}`);
        changes.set(digest, tx.objectChanges.nodes);
      });
    });
  return changes;
}

// Each Exchange / Market keeps its state in a dynamic object field keyed by `extended_field::VersionKey(version)`.
export async function getVersionedState(objectId: string): Promise<any> {
  const parent = await getObject(objectId);
  if (!parent?.fields?.version) throw new Error(`Parchment: object ${objectId} not found`);
  const version = BigInt(parent.fields.version);
  const key = Buffer.alloc(8);
  key.writeBigUInt64LE(version); // BCS of `VersionKey(u64)` is the bare u64
  const bcs = key.toString("base64");
  const data = await graphqlCall(`query ($parent: SuiAddress!, $name: DynamicFieldName!) {
    address(address: $parent) { dynamicObjectField(name: $name) { value { ... on MoveObject { contents { json } } } } }
  }`, { parent: objectId, name: { type: `${PARCHMENT_CORE}::extended_field::VersionKey`, bcs } });
  const state = data?.address?.dynamicObjectField?.value?.contents?.json;
  if (!state) throw new Error(`Parchment: versioned state of ${objectId} (version ${version}) not found`);
  return state;
}
