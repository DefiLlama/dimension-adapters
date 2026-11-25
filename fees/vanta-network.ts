import * as sdk from "@defillama/sdk";
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

// SubtensorModule pallet index and call indexes (#[pallet::call_index] in opentensor/subtensor pallets/subtensor/src/macros/dispatches.rs)
const SUBTENSOR_PALLET = 0x07;
const CALL_ADD_STAKE = 2;        // add_stake(hotkey, netuid: u16, amount_staked: u64)
const CALL_ADD_STAKE_LIMIT = 88; // add_stake_limit(hotkey, netuid: u16, amount_staked: u64, limit_price: u64, allow_partial: bool)
const RAO = 1e9;

type Block = { number: number; hash: string };

const getNonce = async (address: string, at: string): Promise<number> =>
  (await substrate.getSystemAccount({ chain: CHAIN.BITTENSOR, address, at, balanceBytes: 8 })).nonce;

// Blocks in (from, to] where `address` signed at least one extrinsic, found by bisecting its System.Account nonce.
// A day without buybacks costs 2 storage reads; each buyback costs ~log2(7200) ≈ 13 reads plus one block fetch.
async function findSignerBlocks(address: string, from: Block, to: Block): Promise<number[]> {
  const nonceAt = async (n: number) =>
    getNonce(address, (await substrate.getBlockHash({ chain: CHAIN.BITTENSOR, number: n })) as string);
  const out: number[] = [];
  const search = async (lo: number, nLo: number, hi: number, nHi: number) => {
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

// TAO amounts of add_stake / add_stake_limit calls on netuid 8 signed by `signer`.
// Signed v4 extrinsic: Compact<len> ++ 0x84 ++ 0x00 (MultiAddress::Id) ++ signer[32] ++ signature ++ extensions ++ call.
// The calls have a fixed size, so they are matched on the extrinsic tail.
function readStakes(extrinsics: string[], signer: string): bigint[] {
  const out: bigint[] = [];
  for (const ext of extrinsics) {
    const raw = Buffer.from(ext.replace(/^0x/, ""), "hex");
    const mode = raw[0] & 3;
    const b = raw.subarray(mode === 0 ? 1 : mode === 1 ? 2 : 4);
    if (b[0] !== 0x84 || b[1] !== 0x00 || b.subarray(2, 34).toString("hex") !== signer) continue;
    const tail = (len: number) => (b.length >= len ? b.subarray(b.length - len) : undefined);
    const stake = tail(2 + 32 + 2 + 8);
    if (stake && stake[0] === SUBTENSOR_PALLET && stake[1] === CALL_ADD_STAKE && stake.readUInt16LE(34) === NETUID)
      out.push(stake.readBigUInt64LE(36));
    const stakeLimit = tail(2 + 32 + 2 + 8 + 8 + 1);
    if (stakeLimit && stakeLimit[0] === SUBTENSOR_PALLET && stakeLimit[1] === CALL_ADD_STAKE_LIMIT && stakeLimit.readUInt16LE(34) === NETUID)
      out.push(stakeLimit.readBigUInt64LE(36));
  }
  return out;
}

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();

  const from: Block = await substrate.getBlockAtTimestamp({ chain: CHAIN.BITTENSOR, timestamp: options.startTimestamp });
  const to: Block = await substrate.getBlockAtTimestamp({ chain: CHAIN.BITTENSOR, timestamp: options.endTimestamp });

  const signer = Buffer.from(substrate.ss58Decode(BUYBACK_COLDKEY)).toString("hex");
  const freeAt = async (number: number) => {
    const at = (await substrate.getBlockHash({ chain: CHAIN.BITTENSOR, number })) as string;
    return BigInt((await substrate.getSystemAccount({ chain: CHAIN.BITTENSOR, address: BUYBACK_COLDKEY, at, balanceBytes: 8 })).free);
  };
  let rao = 0n;
  for (const number of await findSignerBlocks(BUYBACK_COLDKEY, from, to)) {
    const block = await substrate.getBlock({ chain: CHAIN.BITTENSOR, number });
    const stakes = readStakes(block.extrinsics, signer);
    if (!stakes.length) continue;
    // A failed add_stake_limit (e.g. price limit exceeded) is still included in the block and bumps the nonce, but only
    // pays the fee. Only count stakes covered by the TAO that actually left the wallet's free balance in this block.
    let spent = (await freeAt(number - 1)) - (await freeAt(number));
    for (const amount of stakes) {
      if (amount <= spent) { rao += amount; spent -= amount; }
    }
  }
  const tao = Number(rao) / RAO;
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
  // Hourly refill would hammer the Bittensor archive RPC: a 24h window already takes ~100-200 calls
  // (nonce bisection + block fetches). The public archive is rate limited (~60/min) and flaky.
  pullHourly: false,
  chains: [CHAIN.BITTENSOR],
  fetch,
  start: "2026-09-25", // first add_stake by the buyback coldkey (block 9148017)
  methodology: {
    Fees: "All Vanta Trading product revenue (evaluation fees paid by card or USDC). Since 2026-09-25, all of that revenue goes to SN8 alpha buybacks, measured as TAO spent by the Vanta Trading buyback coldkey 5CXSLbyK5SRB9ZoRJzEqhs2bP3DQTwVaXp7WWLCBTDyNmKfK (add_stake / add_stake_limit extrinsics on netuid 8).",
    Revenue: "All revenue. All Vanta Trading product revenue goes to SN8 alpha buybacks.",
    ProtocolRevenue: "None. All Vanta Trading product revenue goes to SN8 alpha buybacks.",
    HoldersRevenue: "SN8 alpha buybacks, equal to all Vanta Trading product revenue.",
  },
  breakdownMethodology: {
    Fees: {
      "Evaluation Fees": "All Vanta Trading product revenue (evaluation fees paid by card or USDC). Since 2026-09-25, all of that revenue is sent to the buyback coldkey 5CXSLbyK5SRB9ZoRJzEqhs2bP3DQTwVaXp7WWLCBTDyNmKfK and spent buying SN8 alpha (add_stake / add_stake_limit on netuid 8). Failed extrinsics (no TAO debited) are ignored.",
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
