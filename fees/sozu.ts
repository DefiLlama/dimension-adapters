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
  const missing = [...new Set(heights)].filter((h) => timestamps[h] === undefined);
  if (missing.length) {
    const res = await query(`query { ${missing.map((h) => `h${h}: block(height: ${h}) { header { timestamp } }`).join(" ")} }`);
    for (const h of missing) timestamps[h] = res[`h${h}`].header.timestamp;
  }
  return heights.map((h) => timestamps[h]);
}

// Each run would otherwise page the pool's events from its first one: the archive pages a contract's events
// forward only, with no height or time filter. So the adapter keeps checkpoints in DefiLlama's cache: at the end of
// each full page it has read, the cursor the archive returned, the block time of the page's last event and the
// first event after it. A run resumes from the last checkpoint before its window, if the cursor still leads to that
// same event (an archive rebuilt from scratch would number its rows differently); if it doesn't, the checkpoints
// are dropped and the run pages from the start.
// Events come in archive order, which is block order, so their block times only go up.
type Checkpoint = { cursor: string; time: number; next?: { id: number; hash: string } };
const CACHE_KEY = "sozu-pool-event-pages";

const eventsPage = (cursor: string | null) =>
  `finalizedEvents(contractId: "${POOL}", limit: ${PAGE_SIZE}${cursor ? `, cursor: "${cursor}"` : ""}) { json }`;

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

  const cached = (await getCache(CACHE_KEY, CHAIN.DUSK)).checkpoints;
  let checkpoints: Checkpoint[] = Array.isArray(cached) ? cached : [];
  let changed = false;

  // The first request asks for the last finalized block and the page after the last checkpoint before the window.
  // The runner's window is [end - 1 - size, end), so startTimestamp is the last second of the previous window: a
  // block on that second belongs to the previous window.
  let start = checkpoints.filter((c) => c.next && c.time <= options.startTimestamp).pop();
  const first = await query(`query { pair: lastBlockPair { json } page: ${eventsPage(start?.cursor ?? null)} }`);
  const finalized = first.pair.json.last_finalized_block[0];
  let page = first.page.json;
  if (start && (page.events[0]?.id !== start.next?.id || page.events[0]?.block_hash !== start.next?.hash)) {
    [checkpoints, changed, start] = [[], true, undefined];
    page = (await query(`query { page: ${eventsPage(null)} }`)).page.json;
  }
  let cursor = start?.cursor ?? null;
  const byCursor = new Map(checkpoints.map((c) => [c.cursor, c]));

  // Events come oldest first; stop paging once past the window.
  for (;;) {
    // Block times for this page's events, read together with the last finalized block's.
    const heights: number[] = page.events.map((e: any) => e.block_height);
    const [finalizedTime, ...times] = await blockTimestamps([finalized, ...heights]);
    // Only count finalized blocks; fail rather than undercount a window that isn't fully finalized yet.
    if (finalizedTime < options.endTimestamp)
      throw new Error(`sozu: window ends after the last finalized block ${finalized}`);

    // The first event after a checkpoint is what later runs check its cursor against.
    const from = cursor === null ? undefined : byCursor.get(cursor);
    if (from && !from.next && page.events.length) {
      from.next = { id: page.events[0].id, hash: page.events[0].block_hash };
      changed = true;
    }
    // A full page's end becomes a checkpoint.
    if (page.events.length === PAGE_SIZE && !byCursor.has(page.endCursor)) {
      const checkpoint = { cursor: page.endCursor, time: times[times.length - 1] };
      checkpoints.push(checkpoint);
      byCursor.set(checkpoint.cursor, checkpoint);
      changed = true;
    }

    let pastWindow = false;
    for (const [k, event] of page.events.entries()) {
      const time = times[k];
      if (time >= options.endTimestamp) { pastWindow = true; break; }
      if (event.reverted || time <= options.startTimestamp) continue;
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
    if (pastWindow || !page.hasNextPage) break;
    cursor = page.endCursor;
    page = (await query(`query { page: ${eventsPage(cursor)} }`)).page.json;
  }

  if (changed) {
    checkpoints.sort((a, b) => a.time - b.time);
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
