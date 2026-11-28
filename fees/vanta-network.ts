import * as sdk from "@defillama/sdk";
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getEnv } from "../helpers/env";
import { METRIC } from "../helpers/metrics";
import { sleep } from "../utils/utils";

// Vanta Network = Bittensor subnet 8 (netuid 8), built by Taoshi. Code: https://github.com/taoshidev/vanta-network
// SN8 alpha buybacks, equal to all Vanta Trading product revenue since 2026-09-25, read from Subtensor via `sdk.chains.substrate`.
const { substrate } = sdk.chains;
const NETUID = 8;

// Archive node (default in helpers/env.ts). Passed as a URL so the SDK never falls back to a pruned node.
const RPC: string = getEnv("BITTENSOR_SUBSTRATE_RPC");

// Coldkey that buys SN8 alpha with TAO (labelled "Vanta Trading Buyback Wallet" on https://www.vantanetwork.io/tokenomics)
const BUYBACK_COLDKEY = "5CXSLbyK5SRB9ZoRJzEqhs2bP3DQTwVaXp7WWLCBTDyNmKfK";

// SubtensorModule pallet index in the Subtensor runtime (construct_runtime! in opentensor/subtensor runtime/src/lib.rs)
const SUBTENSOR_PALLET = 0x07;
const RAO = 1e9; // 1 TAO = 1e9 rao

// Public archive allows ~60 req/min and answers 429 with retry_after_seconds: 60.
const MIN_GAP_MS = 1100;
const RETRY_AFTER_MS = 60_000;
const MAX_429_RETRIES = 5;

const isRateLimited = (e: any) =>
  e?.response?.status === 429 || /429|too many requests|rate limit/i.test(String(e?.message ?? e));

// Runs RPC calls one at a time, MIN_GAP_MS apart; waits and retries on 429. Never nest `call`.
let queue: Promise<unknown> = Promise.resolve();
let lastCall = 0;
function call<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(async () => {
    for (let attempt = 0; ; attempt++) {
      await sleep(Math.max(0, lastCall + MIN_GAP_MS - Date.now()));
      lastCall = Date.now();
      try {
        return await fn();
      } catch (e) {
        if (!isRateLimited(e) || attempt >= MAX_429_RETRIES) throw e;
        await sleep(RETRY_AFTER_MS);
      }
    }
  });
  queue = run.catch(() => undefined);
  return run;
}

type Block = { number: number; hash: string };

// Block hashes never change, so cache them across windows.
const hashCache = new Map<number, string>();
async function blockHash(number: number): Promise<string> {
  let hash = hashCache.get(number);
  if (!hash) {
    // Throw on unknown block: `at: null` would read the latest state.
    hash = (await call(() => substrate.getBlockHash({ chain: RPC, number }))) ?? undefined;
    if (!hash) throw new Error(`vanta-network: no block hash for block ${number}`);
    hashCache.set(number, hash);
  }
  return hash;
}

const timestampAt = async (number: number) => {
  const at = await blockHash(number);
  return call(() => substrate.getTimestampAt({ chain: RPC, at }));
};

// Last block with timestamp <= ts. Paced replacement for substrate.getBlockAtTimestamp, which bursts ~35 calls.
async function blockAtTimestamp(ts: number): Promise<Block> {
  const latest = await call(() => substrate.getBlock({ chain: RPC }));
  if (latest.timestamp === undefined) throw new Error("vanta-network: no timestamp on latest block");
  if (latest.timestamp <= ts) return { number: latest.number, hash: latest.hash };
  // Bracket around a 12s-block estimate, then bisect.
  const guess = Math.max(0, latest.number - Math.ceil((latest.timestamp - ts) / 12));
  let lo = guess, hi = latest.number, step = 300;
  while (lo > 0 && (await timestampAt(lo)) > ts) { hi = lo; lo = Math.max(0, lo - step); step *= 2; }
  if (hi === latest.number) {
    step = 300;
    for (let n = lo + step; n < latest.number; n = lo + step) {
      if ((await timestampAt(n)) > ts) { hi = n; break; }
      lo = n; step *= 2;
    }
  }
  while (hi - lo > 1) {
    const mid = lo + Math.floor((hi - lo) / 2);
    if ((await timestampAt(mid)) <= ts) lo = mid; else hi = mid;
  }
  return { number: lo, hash: await blockHash(lo) };
}

const getNonce = async (address: string, at: string): Promise<number> =>
  (await call(() => substrate.getSystemAccount({ chain: RPC, address, at, balanceBytes: 8 }))).nonce;

// Blocks in (from, to] where `address` signed at least one extrinsic, found by bisecting its System.Account nonce.
// A day without buybacks costs 2 storage reads; each buyback block costs ~log2(7200) ≈ 13 reads plus one System.Events read.
// Only blocks where the coldkey itself signs are found (it signs every buyback so far).
async function findSignerBlocks(address: string, from: Block, to: Block): Promise<number[]> {
  const nonceAt = async (n: number) => getNonce(address, await blockHash(n));
  const out: number[] = [];
  const search = async (lo: number, nLo: number, hi: number, nHi: number) => {
    if (nHi < nLo) throw new Error(`vanta-network: nonce went down between blocks ${lo} and ${hi}`); // bad RPC response
    if (nHi === nLo) return;
    if (hi - lo === 1) { out.push(hi); return; }
    const mid = lo + Math.floor((hi - lo) / 2);
    const nMid = await nonceAt(mid);
    await search(lo, nLo, mid, nMid);
    await search(mid, nMid, hi, nHi);
  };
  await search(from.number, await getNonce(address, from.hash), to.number, await getNonce(address, to.hash));
  return out;
}

// SubtensorModule::StakeAdded(coldkey, hotkey, tao_staked: u64, alpha_received: u64, netuid: u16, fee: u64)
// = pallet 7, event 2. Layout checked against raw System.Events at block 9535467 (2026-11-18 buyback).
// Events are read instead of extrinsics so failed calls (no event), partial fills (actual amount),
// batched/proxied calls and incoming transfers in the same block cannot distort the amount.
const STAKE_ADDED = Buffer.from([SUBTENSOR_PALLET, 2]);
const STAKE_REMOVED = Buffer.from([SUBTENSOR_PALLET, 3]);
// EventRecord = phase (5) + StakeAdded/StakeRemoved event (92) + empty topics (1). Checked at block 9535467.
const RECORD_LEN = 98;

// Same-subnet move/transfer_stake emits StakeRemoved then StakeAdded with equal tao/alpha/netuid and 0 fee,
// with no pool swap (transfer_stake_within_subnet_impl in subtensor staking/stake_utils.rs). No TAO is spent.
function isSameSubnetTransfer(events: Buffer, i: number, body: number): boolean {
  const prev = i - RECORD_LEN;
  if (prev < 5) return false;
  return events.readBigUInt64LE(body + 18) === 0n
    && events.subarray(prev, prev + 2).equals(STAKE_REMOVED)
    && events.subarray(prev - 5, prev).equals(events.subarray(i - 5, i)) // same extrinsic
    && events.subarray(prev + 66, prev + 84).equals(events.subarray(body, body + 18)); // tao, alpha, netuid
}

// move_stake, transfer_stake, swap_stake and transfer_stake_and_hotkey emit their own event right after StakeAdded
// (subtensor staking/move_stake.rs). Their TAO comes from selling other alpha, not product revenue.
// Indices from on-chain metadata at blocks 9148017 and latest: StakeMoved 4, StakeTransferred 92, StakeSwapped 93, StakeAndHotkeyTransferred 143.
const MOVE_EVENTS = [4, 92, 93, 143];
function isStakeMove(events: Buffer, i: number): boolean {
  const next = i + RECORD_LEN; // next event, after its phase
  if (next + 2 > events.length) return false;
  return events[next] === SUBTENSOR_PALLET && MOVE_EVENTS.includes(events[next + 1])
    && events.subarray(next - 5, next).equals(events.subarray(i - 5, i)); // same extrinsic
}

// TAO debited by each StakeAdded on netuid 8 for `coldkey`, in rao. tao_staked is the gross amount (the swap fee is taken out of it).
// Matches the 34-byte prefix (event index ++ coldkey) in the raw Vec<EventRecord>; the coldkey makes a false match negligible.
function readStakeAdded(events: Buffer, coldkey: Buffer): bigint[] {
  const needle = Buffer.concat([STAKE_ADDED, coldkey]);
  const out: bigint[] = [];
  for (let i = events.indexOf(needle); i !== -1; i = events.indexOf(needle, i + 1)) {
    const body = i + needle.length + 32; // skip hotkey
    if (body + 8 + 8 + 2 + 8 > events.length) throw new Error("vanta-network: truncated StakeAdded event"); // layout changed
    if (events.readUInt16LE(body + 16) !== NETUID) continue;
    if (isSameSubnetTransfer(events, i, body) || isStakeMove(events, i)) continue;
    out.push(events.readBigUInt64LE(body));
  }
  return out;
}

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();

  // Last block <= t, so `- 1` makes the scanned range (from, to] = [start, end).
  const from = await blockAtTimestamp(options.startTimestamp - 1);
  const to = await blockAtTimestamp(options.endTimestamp - 1);

  const coldkey = Buffer.from(substrate.ss58Decode(BUYBACK_COLDKEY));
  let rao = 0n;
  for (const number of await findSignerBlocks(BUYBACK_COLDKEY, from, to)) {
    const at = await blockHash(number);
    const events = await call(() => substrate.getStorage({ chain: RPC, pallet: "System", item: "Events", at }));
    if (!events) throw new Error(`vanta-network: no System.Events at block ${number}`);
    for (const amount of readStakeAdded(Buffer.from(events.replace(/^0x/, ""), "hex"), coldkey)) rao += amount;
  }
  const tao = Number(rao) / RAO; // < 2^53 rao (~9M TAO) per day, no precision loss
  const dailyRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();
  // Fees use a source label; revenue/holders use destination labels (fees/AGENTS.md).
  dailyFees.addCGToken("bittensor", tao, "Evaluation Fees");
  dailyRevenue.addCGToken("bittensor", tao, "Evaluation Fees To Buybacks");
  dailyHoldersRevenue.addCGToken("bittensor", tao, METRIC.TOKEN_BUY_BACK);

  return {
    dailyFees,
    dailyRevenue,
    dailyHoldersRevenue,
    dailyProtocolRevenue: 0, // all revenue goes to SN8 alpha buybacks; nothing is kept in a treasury
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  // Not hourly: the only source with history is a Subtensor ARCHIVE node (no indexer/Dune/Allium for Bittensor here),
  // and the public one is rate limited (~60 req/min). Each window pays a fixed ~40 calls just to locate its two
  // boundary blocks (timestamp bisection), so 24 hourly windows cost ~24x a daily one and exceed that limit.
  pullHourly: false,
  chains: [CHAIN.BITTENSOR],
  fetch,
  start: "2026-09-25", // first add_stake by the buyback coldkey (block 9148017)
  methodology: {
    Fees: "All Vanta Trading product revenue (evaluation fees paid by card or USDC). Since 2026-09-25, all of that revenue goes to SN8 alpha buybacks, measured as TAO spent by the Vanta Trading buyback coldkey 5CXSLbyK5SRB9ZoRJzEqhs2bP3DQTwVaXp7WWLCBTDyNmKfK (SubtensorModule StakeAdded events on netuid 8). Fees are recorded on the day the buyback executes.",
    Revenue: "All Vanta Trading evaluation fees, all of which are spent on SN8 alpha buybacks.",
    ProtocolRevenue: "None. All Vanta Trading product revenue goes to SN8 alpha buybacks.",
    HoldersRevenue: "SN8 alpha buybacks, equal to all Vanta Trading product revenue.",
  },
  breakdownMethodology: {
    Fees: {
      "Evaluation Fees": "All Vanta Trading product revenue (evaluation fees paid by card or USDC). Since 2026-09-25, all of that revenue is sent to the buyback coldkey 5CXSLbyK5SRB9ZoRJzEqhs2bP3DQTwVaXp7WWLCBTDyNmKfK and spent buying SN8 alpha (StakeAdded events on netuid 8). Failed extrinsics emit no StakeAdded and are ignored. Stake moves, swaps and transfers are excluded.",
    },
    Revenue: {
      "Evaluation Fees To Buybacks": "All Vanta Trading product revenue, all of which goes to SN8 alpha buybacks.",
    },
    HoldersRevenue: {
      [METRIC.TOKEN_BUY_BACK]: "SN8 alpha bought back with TAO on the subnet pool, equal to all Vanta Trading product revenue.",
    },
  },
};

export default adapter;
