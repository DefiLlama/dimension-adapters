import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";
import { getCache, setCache } from "../helpers/cache";
import { httpPost } from "../utils/fetchURL";

// Sozu: liquid staking on Dusk mainnet (https://sozu.fi). The pool contract stakes deposited DUSK through
// provisioners and mints stDUSK. Every 360 blocks (about an hour) it withdraws the provisioners' staking rewards
// and restakes them, which raises the DUSK each stDUSK is worth; a provisioner leaving the pool hands over its
// last rewards the same way. Each time, the pool emits a `reward` event with the gross reward and the fee it took:
// each operator's share of the fee is minted to that operator as stDUSK, and the rest to Sozu's treasury.
// Deposits pay a deposit fee, also minted to the treasury, and emit a `deposit` event with it.
//
// Rewards accrue per block in Dusk's stake contract and the pool harvests them hourly, so the harvest events are
// the accrual. Dusk nodes don't serve past contract state, so an exchange-rate snapshot for a past day isn't
// available; the events carry the same amounts.
// https://duskscan.net/contract/6fdfdc713a18fc6ca2ad20eb2b4a3305a935ef47d6a872d9a4df8bc9fd9d169e
const POOL = "6fdfdc713a18fc6ca2ad20eb2b4a3305a935ef47d6a872d9a4df8bc9fd9d169e";
const POOL_FIRST_EVENT_HEIGHT = 2693535; // the pool's first deposit, 2025-11-15

// Public Dusk node; the archive GraphQL serves finalized contract events.
const GRAPHQL = "https://nodes.dusk.network/on/graphql/query";
const PAGE_SIZE = 200; // the most `finalizedEvents` returns per page
// 1 DUSK = 10^9 LUX: DUSK_UNIT in https://github.com/dusk-network/rusk/blob/master/core/src/dusk.rs
const LUX_PER_DUSK = 1_000_000_000n;

// Whole DUSK and the LUX remainder go through Number() separately, so no u64 amount gets rounded first.
const toDusk = (lux: bigint) => Number(lux / LUX_PER_DUSK) + Number(lux % LUX_PER_DUSK) / 1e9;

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

// Each run would otherwise page the pool's events from its first one: the archive pages a contract's events
// forward only, with no height filter. So the adapter keeps checkpoints in DefiLlama's cache: for each full page it
// has read, the cursor the archive returned at the page's end and the page's last event. A run resumes from the
// last checkpoint before its window. To make sure the cursor still means the same place (an archive rebuilt from
// scratch would number its rows differently), it first re-reads that page and compares its last event; if it
// differs, the checkpoints are dropped and the run pages from the start.
// Events come in archive order, which is block order: each page's events are at or above the previous page's.
type Checkpoint = { prev: string | null; cursor: string; id: number; hash: string; height: number };
const CACHE_KEY = "sozu-pool-event-pages";

async function eventsPage(cursor: string | null) {
  const res = await query(`query { finalizedEvents(contractId: "${POOL}", limit: ${PAGE_SIZE}${cursor ? `, cursor: "${cursor}"` : ""}) { json } }`);
  return res.finalizedEvents.json;
}

// Whether a checkpoint's cursor still ends the same page: re-read that page and compare its last event.
async function stillValid(checkpoint: Checkpoint) {
  const page = await eventsPage(checkpoint.prev);
  const last = page.events[page.events.length - 1];
  return page.events.length === PAGE_SIZE && page.endCursor === checkpoint.cursor && last.id === checkpoint.id && last.block_hash === checkpoint.hash;
}

// Event data is the rkyv archive of the pool's event. The root object is written last, so its fixed-size fields
// sit at fixed offsets from the END of the buffer (out-of-line data such as the provisioner list comes first).
// The archived structs use Rust's default layout, which puts the u64s before the smaller fields.
//
// RewardEvent, a 64-byte root (sozu-contracts-core, pool/events.rs):
//   provisioners: Vec<Provisioner>        // len - 64
//   amount: u64, the gross reward          // len - 56
//   fee_total: u64, the fee taken from it  // len - 48
//   fee_pool: u64, the treasury's part     // len - 40
//   fee_operators: BTreeMap<Account, u64>  // len - 32 (the operators get fee_total - fee_pool)
//   total_stake: u64                       // len - 24
//   token_total_supply: u64                // len - 16
//   operation: u8 (Recycle | Terminate)    // len - 8
function decodeReward(hex: string) {
  const data = Buffer.from(hex, "hex");
  const end = data.length;
  if (end < 64) throw new Error(`sozu: unexpected reward length ${end}`);
  const amount = data.readBigUInt64LE(end - 56);
  const feeTotal = data.readBigUInt64LE(end - 48);
  const feePool = data.readBigUInt64LE(end - 40);
  const operation = data[end - 8];
  if (operation > 1 || feeTotal > amount || feePool > feeTotal)
    throw new Error(`sozu: unexpected reward layout (length ${end}, operation ${operation})`);
  return { amount, feeTotal, feePool };
}

// DepositEvent has no out-of-line data, so it is all root: amount, fee, total_stake and token_total_supply as
// u64s first, then the depositor's account.
function decodeDeposit(hex: string) {
  const data = Buffer.from(hex, "hex");
  if (data.length < 32) throw new Error(`sozu: unexpected deposit length ${data.length}`);
  const amount = data.readBigUInt64LE(0);
  const fee = data.readBigUInt64LE(8);
  if (fee > amount) throw new Error(`sozu: unexpected deposit layout (length ${data.length})`);
  return { fee };
}

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyUserFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  // Only count finalized blocks; fail rather than undercount a window that isn't fully finalized yet.
  const pair = (await query("query { lastBlockPair { json } }")).lastBlockPair.json;
  const finalized = pair.last_finalized_block[0];
  if ((await blockTimestamps([finalized]))[0] < options.endTimestamp)
    throw new Error(`sozu: window ends after the last finalized block ${finalized}`);

  // The runner's window is [end - 1 - size, end), so startTimestamp is the last second of the previous
  // window. Starting at the next second counts a block on that second in one window only.
  const fromHeight = await firstHeightAtOrAfter(options.startTimestamp + 1, POOL_FIRST_EVENT_HEIGHT, finalized);
  const toHeight = await firstHeightAtOrAfter(options.endTimestamp, fromHeight, finalized);

  const cached = (await getCache(CACHE_KEY, CHAIN.DUSK)).checkpoints;
  let checkpoints: Checkpoint[] = Array.isArray(cached) ? cached : [];
  let changed = false;

  // Start from the last checkpoint before the window, or from the pool's first event.
  let cursor: string | null = null;
  const start = checkpoints.filter((c) => c.height < fromHeight).pop();
  if (start && (await stillValid(start))) cursor = start.cursor;
  else if (start) [checkpoints, changed] = [[], true];
  const known = new Set(checkpoints.map((c) => c.cursor));

  // Events come oldest first; stop paging once past the window.
  let pastWindow = false;
  while (!pastWindow) {
    const page: any = await eventsPage(cursor);
    const last = page.events[page.events.length - 1];
    // Only a full page keeps its end: a partial one gains events later, and re-reading it wouldn't match.
    if (page.events.length === PAGE_SIZE && !known.has(page.endCursor)) {
      checkpoints.push({ prev: cursor, cursor: page.endCursor, id: last.id, hash: last.block_hash, height: last.block_height });
      known.add(page.endCursor);
      changed = true;
    }
    for (const event of page.events) {
      if (event.block_height >= toHeight) { pastWindow = true; break; }
      if (event.reverted || event.block_height < fromHeight) continue;
      if (event.topic === "reward") {
        const { amount, feeTotal, feePool } = decodeReward(event.data);
        dailyFees.addCGToken("dusk-network", toDusk(amount), METRIC.STAKING_REWARDS);
        dailyRevenue.addCGToken("dusk-network", toDusk(feePool), "Staking Rewards To Treasury");
        dailySupplySideRevenue.addCGToken("dusk-network", toDusk(amount - feeTotal), "Staking Rewards To stDUSK Holders");
        dailySupplySideRevenue.addCGToken("dusk-network", toDusk(feeTotal - feePool), "Staking Rewards To Node Operators");
      } else if (event.topic === "deposit") {
        const { fee } = decodeDeposit(event.data);
        dailyFees.addCGToken("dusk-network", toDusk(fee), METRIC.DEPOSIT_WITHDRAW_FEES);
        dailyUserFees.addCGToken("dusk-network", toDusk(fee), METRIC.DEPOSIT_WITHDRAW_FEES);
        dailyRevenue.addCGToken("dusk-network", toDusk(fee), "Deposit Fees To Treasury");
      }
    }
    if (!page.hasNextPage) break;
    cursor = page.endCursor;
  }

  if (changed) {
    checkpoints.sort((a, b) => a.height - b.height || a.id - b.id);
    await setCache(CACHE_KEY, CHAIN.DUSK, { checkpoints });
  }
  return { dailyFees, dailyUserFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue.clone(), dailySupplySideRevenue };
};

// Rates, read from the events: the fee on staking rewards was 10% from the first harvest (2025-11-17) and is 15%
// since 2026-09-08 (block 5,177,415); each operator's share of it is set per operator; deposits pay 0.25%. The
// adapter takes the amounts from each event rather than applying these rates.
const methodology = {
  Fees: "Staking rewards earned by the DUSK staked through Sozu's pool, counted as the pool harvests and restakes them every hour, plus deposit fees.",
  UserFees: "The 0.25% fee on DUSK deposited into Sozu's pool.",
  Revenue: "Sozu's treasury share of its fee on staking rewards (10% of rewards until 2026-09-07, 15% since), net of the operators' share, plus the 0.25% deposit fee; both are minted to the treasury as stDUSK.",
  ProtocolRevenue: "Sozu's treasury share of its fee on staking rewards, net of the operators' share, plus the 0.25% deposit fee, minted to Sozu's treasury as stDUSK.",
  SupplySideRevenue: "Staking rewards kept by stDUSK holders (90% until 2026-09-07, 85% since) plus the share of Sozu's fee paid to the operators running its provisioners.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.STAKING_REWARDS]: "Staking rewards the pool withdraws from its provisioners and restakes.",
    [METRIC.DEPOSIT_WITHDRAW_FEES]: "The fee on DUSK deposited into the pool.",
  },
  UserFees: {
    [METRIC.DEPOSIT_WITHDRAW_FEES]: "The fee on DUSK deposited into the pool.",
  },
  Revenue: {
    "Staking Rewards To Treasury": "The treasury's part of the fee on staking rewards.",
    "Deposit Fees To Treasury": "Deposit fees, minted to the treasury as stDUSK.",
  },
  ProtocolRevenue: {
    "Staking Rewards To Treasury": "The treasury's part of the fee on staking rewards.",
    "Deposit Fees To Treasury": "Deposit fees, minted to the treasury as stDUSK.",
  },
  SupplySideRevenue: {
    "Staking Rewards To stDUSK Holders": "Staking rewards left after Sozu's fee, which raise the DUSK each stDUSK is worth.",
    "Staking Rewards To Node Operators": "The operators' part of the fee on staking rewards, minted to them as stDUSK.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.DUSK],
  start: "2025-11-15",
  methodology,
  breakdownMethodology,
  // One run a day keeps requests to the public Dusk node low.
  pullHourly: false,
};

export default adapter;
