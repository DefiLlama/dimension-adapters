import * as sdk from "@defillama/sdk";
import { PromisePool } from "@supercharge/promise-pool";
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";

// Vanta Network = Bittensor subnet 8 (netuid 8), built by Taoshi. Code: https://github.com/taoshidev/vanta-network
// SN8 alpha buybacks, equal to all Vanta Trading product revenue since 2026-09-25, read from Subtensor via `sdk.chains.substrate`.
// Needs an ARCHIVE Substrate endpoint in BITTENSOR_SUBSTRATE_RPC (e.g. https://archive.chain.opentensor.ai);
// the default public endpoints keep only ~256 blocks of state.
const { substrate } = sdk.chains;
const NETUID = 8;

// Coldkey that buys SN8 alpha with TAO (labelled "Vanta Trading Buyback Wallet" on https://www.vantanetwork.io/tokenomics)
const BUYBACK_COLDKEY = "5CXSLbyK5SRB9ZoRJzEqhs2bP3DQTwVaXp7WWLCBTDyNmKfK";

// SubtensorModule pallet index in the Subtensor runtime (construct_runtime! in opentensor/subtensor runtime/src/lib.rs)
const SUBTENSOR_PALLET = 0x07;
const RAO = 1e9; // 1 TAO = 1e9 rao

type Block = { number: number; hash: string };

const getNonce = async (address: string, at: string): Promise<number> =>
  (await substrate.getSystemAccount({ chain: CHAIN.BITTENSOR, address, at, balanceBytes: 8 })).nonce;

// Blocks in (from, to] where `address` signed at least one extrinsic, found by bisecting its System.Account nonce.
// A day without buybacks costs 2 storage reads; each buyback block costs ~log2(7200) ≈ 13 reads plus one System.Events read.
// Only blocks where the coldkey itself signs are found (it signs every buyback so far).
async function findSignerBlocks(address: string, from: Block, to: Block): Promise<number[]> {
  const nonceAt = async (n: number) =>
    getNonce(address, (await substrate.getBlockHash({ chain: CHAIN.BITTENSOR, number: n })) as string);
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

// TAO debited by each StakeAdded on netuid 8 for `coldkey`, in rao. tao_staked is the gross amount (the swap fee is taken out of it).
// Matches the 34-byte prefix (event index ++ coldkey) in the raw Vec<EventRecord>; the coldkey makes a false match negligible.
function readStakeAdded(events: Buffer, coldkey: Buffer): bigint[] {
  const needle = Buffer.concat([STAKE_ADDED, coldkey]);
  const out: bigint[] = [];
  for (let i = events.indexOf(needle); i !== -1; i = events.indexOf(needle, i + 1)) {
    const body = i + needle.length + 32; // skip hotkey
    if (body + 8 + 8 + 2 + 8 > events.length) continue;
    if (events.readUInt16LE(body + 16) !== NETUID) continue;
    out.push(events.readBigUInt64LE(body));
  }
  return out;
}

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();

  // getBlockAtTimestamp returns the last block <= t, so `- 1` makes the scanned range (from, to] = [start, end).
  const from: Block = await substrate.getBlockAtTimestamp({ chain: CHAIN.BITTENSOR, timestamp: options.startTimestamp - 1 });
  const to: Block = await substrate.getBlockAtTimestamp({ chain: CHAIN.BITTENSOR, timestamp: options.endTimestamp - 1 });

  const coldkey = Buffer.from(substrate.ss58Decode(BUYBACK_COLDKEY));
  const blocks = await findSignerBlocks(BUYBACK_COLDKEY, from, to);
  // Low concurrency: the public archive node is rate limited (~60 req/min).
  const { results, errors } = await PromisePool.withConcurrency(2).for(blocks).process(async (number) => {
    const at = (await substrate.getBlockHash({ chain: CHAIN.BITTENSOR, number })) as string;
    const events = await substrate.getStorage({ chain: CHAIN.BITTENSOR, pallet: "System", item: "Events", at });
    if (!events) throw new Error(`vanta-network: no System.Events at block ${number}`);
    return readStakeAdded(Buffer.from(events.replace(/^0x/, ""), "hex"), coldkey);
  });
  if (errors.length) throw errors[0];
  let rao = 0n;
  for (const amounts of results) for (const amount of amounts) rao += amount;
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
  // and the public one is rate limited (~60 req/min). Each window pays a fixed ~30-40 calls just to locate its two
  // boundary blocks (getBlockAtTimestamp bisection), so 24 hourly windows cost ~24x a daily one and exceed that limit.
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
      "Evaluation Fees": "All Vanta Trading product revenue (evaluation fees paid by card or USDC). Since 2026-09-25, all of that revenue is sent to the buyback coldkey 5CXSLbyK5SRB9ZoRJzEqhs2bP3DQTwVaXp7WWLCBTDyNmKfK and spent buying SN8 alpha (StakeAdded events on netuid 8). Failed extrinsics emit no StakeAdded and are ignored.",
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
