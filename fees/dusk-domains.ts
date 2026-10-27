import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getCache, setCache } from "../helpers/cache";
import { httpPost } from "../utils/fetchURL";

// Dusk Domains: the .dusk name service on Dusk mainnet (https://dusk.domains).
//
// Every fee the protocol takes is paid into one vault contract, which emits a
// `fee_received` event per payment: registrations and renewals (forwarded by
// the store contract) and the marketplace's cut of name sales (forwarded by the
// marketplace contract). The event carries the gross amount and the referrer's
// share of it, so fees, supply side and revenue all come from it.
// Names the operator issues as reserved pay no fee and emit no such event.
// The sums match the vault's own running totals at
// https://dusk.domains/api/treasury: `totalReceivedLux` for fees, and
// `referralLiabilityLux + referralClaimedLux` for referral shares.
// Mainnet contract ids, listed in the "deployment" section of https://dusk.domains/api/health:
// https://duskscan.net/contract/aaaefaf86e0df54e6cc6680d49b7abb934f3252deb4d6383d393f8dacb2c814f
const VAULT = "aaaefaf86e0df54e6cc6680d49b7abb934f3252deb4d6383d393f8dacb2c814f";
// https://duskscan.net/contract/33bd9ec8c70425f1a60c8a9e2fc860f15b822a3fcd2cf72b02b515a926de2b50
const STORE = "33bd9ec8c70425f1a60c8a9e2fc860f15b822a3fcd2cf72b02b515a926de2b50";
// https://duskscan.net/contract/d8c003e0788548cb78ae029f0d7cfeb91aebc992a9ab200b31ac8967e35842b8
const MARKETPLACE = "d8c003e0788548cb78ae029f0d7cfeb91aebc992a9ab200b31ac8967e35842b8";
const VAULT_DEPLOY_HEIGHT = 5556173; // `vault_initialized`, 2026-10-21

// Public Dusk node; the archive GraphQL serves finalized contract events.
const GRAPHQL = "https://nodes.dusk.network/on/graphql/query";
const PAGE_SIZE = 200; // the most `finalizedEvents` returns per page
// 1 DUSK = 10^9 LUX: DUSK_UNIT in https://github.com/dusk-network/rusk/blob/master/core/src/dusk.rs
const LUX_PER_DUSK = 1_000_000_000n;

// Whole DUSK and the LUX remainder go through Number() separately, so no u64 amount gets rounded first.
const toDusk = (lux: bigint) => Number(lux / LUX_PER_DUSK) + Number(lux % LUX_PER_DUSK) / 1e9;

// FeeReason in the vault, in declaration order (the archived enum tag).
const REASONS = ["Registration Fees", "Renewal Fees", "Marketplace Fees"];
const SOURCE_OF_REASON = [STORE, STORE, MARKETPLACE];

async function query(body: string) {
  const res = await httpPost(GRAPHQL, body, { headers: { "content-type": "application/graphql" }, timeout: 30_000 });
  if (res.errors) throw new Error(`dusk graphql: ${JSON.stringify(res.errors)}`);
  return res;
}

const timestamps: Record<number, number> = {};
// Block timestamps for `heights`, read in one request (GraphQL aliases) and kept for the run.
async function blockTimestamps(heights: number[]) {
  const missing = heights.filter((h) => timestamps[h] === undefined);
  if (missing.length) {
    const res = await query(`query { ${missing.map((h) => `h${h}: block(height: ${h}) { header { timestamp } }`).join(" ")} }`);
    for (const h of missing) timestamps[h] = res[`h${h}`].header.timestamp;
  }
  return heights.map((h) => timestamps[h]);
}

// Lowest height in [lo, hi] whose block timestamp is >= ts (hi if none is). Each request reads up to 64 heights
// spread over the range and narrows it to the gap between two of them, so ~4 requests cover all of Dusk's history.
async function firstHeightAtOrAfter(ts: number, lo: number, hi: number) {
  while (lo < hi) {
    const step = Math.ceil((hi - lo) / 64);
    const probes: number[] = [];
    for (let h = lo; h < hi; h += step) probes.push(h);
    const times = await blockTimestamps(probes);
    const i = times.findIndex((t) => t >= ts);
    if (i === 0) return lo;
    if (i === -1) lo = probes[probes.length - 1] + 1;
    else [lo, hi] = [probes[i - 1] + 1, probes[i]];
  }
  return lo;
}

// Each run would otherwise page the vault's events from its first one: the archive pages a contract's events
// forward only, with no height filter. So the adapter keeps checkpoints in DefiLlama's cache: at the end of each
// full page it has read, the cursor the archive returned, the height of the page's last event and the first event
// after it. A run resumes from the last checkpoint before its window, once a one-event read shows the cursor still
// leads to that same event (an archive rebuilt from scratch would number its rows differently); if it doesn't, the
// checkpoints are dropped and the run pages from the start.
// Events come in archive order, which is block order: each page's events are at or above the previous page's.
type Checkpoint = { cursor: string; height: number; next?: { id: number; hash: string } };
const CACHE_KEY = "dusk-domains-vault-event-pages";

async function eventsPage(cursor: string | null, limit = PAGE_SIZE) {
  const res = await query(`query { finalizedEvents(contractId: "${VAULT}", limit: ${limit}${cursor ? `, cursor: "${cursor}"` : ""}) { json } }`);
  return res.finalizedEvents.json;
}

// Whether a checkpoint's cursor still leads to the event it led to when it was saved.
async function stillValid(checkpoint: Checkpoint) {
  const first = (await eventsPage(checkpoint.cursor, 1)).events[0];
  return first?.id === checkpoint.next?.id && first?.block_hash === checkpoint.next?.hash;
}

// Each event's data is the rkyv archive of the vault's `Event<FeeReceived>`
// (all fields #[repr(C)]). rkyv writes out-of-line bytes (the payer's and
// referrer's keys) first and the root object last, so the root's fixed-size
// fields sit at fixed offsets from the END of the buffer:
//   Event { version: u16, op_seq: u64, body: FeeReceived {
//     source: [u8; 32],                                        // len - 192
//     metadata: FeeMetadata {
//       version: u16,                                          // len - 160
//       reason: u8 (Registration | Renewal | Marketplace),     // len - 158
//       name, payer, beneficiary,
//       referral_lux: u64 },                                   // len - 40
//     received_lux: u64,                                       // len - 32
//     protocol_lux, liability_lux, beneficiary_claimable_lux: u64 } }
function decodeFee(hex: string) {
  const data = Buffer.from(hex, "hex");
  const end = data.length;
  const source = data.subarray(end - 192, end - 160).toString("hex");
  const version = data.readUInt16LE(end - 160);
  const reason = data[end - 158];
  if (version !== 1 || SOURCE_OF_REASON[reason] !== source)
    throw new Error(`dusk-domains: unexpected fee_received layout (version ${version}, reason ${reason}, source ${source})`);
  return {
    label: REASONS[reason],
    receivedLux: data.readBigUInt64LE(end - 32),
    referralLux: data.readBigUInt64LE(end - 40),
  };
}

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const dailyRevenue = options.createBalances();

  // Only count finalized blocks; fail rather than undercount a window that
  // isn't fully finalized yet.
  const pair = (await query("query { lastBlockPair { json } }")).lastBlockPair.json;
  const finalized = pair.last_finalized_block[0];
  if ((await blockTimestamps([finalized]))[0] < options.endTimestamp)
    throw new Error(`dusk-domains: window ends after the last finalized block ${finalized}`);

  // The runner's window is [end - 1 - size, end), so startTimestamp is the last second of the previous
  // window. Starting at the next second counts a block on that second in one window only.
  const fromHeight = await firstHeightAtOrAfter(options.startTimestamp + 1, VAULT_DEPLOY_HEIGHT, finalized);
  const toHeight = await firstHeightAtOrAfter(options.endTimestamp, fromHeight, finalized);

  const cached = (await getCache(CACHE_KEY, CHAIN.DUSK)).checkpoints;
  let checkpoints: Checkpoint[] = Array.isArray(cached) ? cached : [];
  let changed = false;

  // Start from the last checkpoint before the window, or from the vault's first event.
  let cursor: string | null = null;
  const start = checkpoints.filter((c) => c.next && c.height < fromHeight).pop();
  if (start && (await stillValid(start))) cursor = start.cursor;
  else if (start) [checkpoints, changed] = [[], true];
  const byCursor = new Map(checkpoints.map((c) => [c.cursor, c]));

  // Events come oldest first; stop paging once past the window.
  let pastWindow = false;
  while (!pastWindow) {
    const page: any = await eventsPage(cursor);
    const first = page.events[0];
    const last = page.events[page.events.length - 1];
    // The first event after a checkpoint is what later runs check its cursor against.
    const from = cursor === null ? undefined : byCursor.get(cursor);
    if (from && !from.next && first) {
      from.next = { id: first.id, hash: first.block_hash };
      changed = true;
    }
    // A full page's end becomes a checkpoint.
    if (page.events.length === PAGE_SIZE && !byCursor.has(page.endCursor)) {
      const checkpoint = { cursor: page.endCursor, height: last.block_height };
      checkpoints.push(checkpoint);
      byCursor.set(checkpoint.cursor, checkpoint);
      changed = true;
    }
    for (const event of page.events) {
      if (event.block_height >= toHeight) { pastWindow = true; break; }
      if (event.topic !== "fee_received" || event.reverted || event.block_height < fromHeight) continue;
      const { label, receivedLux, referralLux } = decodeFee(event.data);
      dailyFees.addCGToken("dusk-network", toDusk(receivedLux), label);
      dailySupplySideRevenue.addCGToken("dusk-network", toDusk(referralLux), `${label} To Referrers`);
      dailyRevenue.addCGToken("dusk-network", toDusk(receivedLux - referralLux), `${label} To Treasury`);
    }
    if (!page.hasNextPage) break;
    cursor = page.endCursor;
  }

  if (changed) {
    checkpoints.sort((a, b) => a.height - b.height);
    await setCache(CACHE_KEY, CHAIN.DUSK, { checkpoints });
  }
  return { dailyFees, dailySupplySideRevenue, dailyRevenue, dailyProtocolRevenue: dailyRevenue };
};

// Rates: the marketplace's `fee_bps` (250) at https://dusk.domains/api/marketplace/config, and the referral
// shares (`referralRewardBps` 2000, `renewalReferralRewardBps` 1000) at https://dusk.domains/api/fee-config.
// The vault rejects any fee whose referral share is above 30%.
const methodology = {
  Fees: "DUSK paid to register and renew .dusk names (including premium pricing on new names) and the 2.5% marketplace fee on name sales, from the vault contract's fee_received events.",
  SupplySideRevenue: "The referrer's share of a fee, credited in the vault for the referrer to claim: 20% of a registration's base price and 10% of a renewal since launch on 21 Oct 2026, capped at 30% of any fee by the vault.",
  Revenue: "Fees (DUSK paid to register and renew .dusk names (including premium pricing on new names) and the 2.5% marketplace fee on name sales) minus referral shares, kept by the vault as protocol funds.",
  ProtocolRevenue: "Fees (DUSK paid to register and renew .dusk names (including premium pricing on new names) and the 2.5% marketplace fee on name sales).",
};

const breakdownMethodology = {
  Fees: {
    "Registration Fees": "DUSK paid to register a name, base price plus any premium.",
    "Renewal Fees": "DUSK paid to extend a name's registration.",
    "Marketplace Fees": "The marketplace's 2.5% cut of name sales.",
  },
  SupplySideRevenue: {
    "Registration Fees To Referrers": "Referral share of registration fees.",
    "Renewal Fees To Referrers": "Referral share of renewal fees.",
    "Marketplace Fees To Referrers": "Referral share of marketplace fees.",
  },
  Revenue: {
    "Registration Fees To Treasury": "Registration fees minus the referral share.",
    "Renewal Fees To Treasury": "Renewal fees minus the referral share.",
    "Marketplace Fees To Treasury": "Marketplace fees minus the referral share.",
  },
  ProtocolRevenue: {
    "Registration Fees To Treasury": "Registration fees minus the referral share.",
    "Renewal Fees To Treasury": "Renewal fees minus the referral share.",
    "Marketplace Fees To Treasury": "Marketplace fees minus the referral share.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.DUSK],
  start: "2026-10-21",
  methodology,
  breakdownMethodology,
  pullHourly: true,
};

export default adapter;
