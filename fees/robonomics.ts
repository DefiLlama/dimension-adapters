import { FetchOptions, ProtocolType, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";
import { postURL } from "../utils/fetchURL";

// Robonomics Polkadot parachain. The listing's old source, robonomics.api.subscan.io, returns 404 (checked 2026-11-08, last stored day 2026-11-02)
const RPC = "https://polkadot.rpc.robonomics.network";
const XRT_DECIMALS = 9;
const EXISTENTIAL_DEPOSIT = 1000n; // Balances.ExistentialDeposit in planck (runtime constant, specs 40-53)
const BATCH_SIZE = 100;

const POT_START_BLOCK = 3137055;

// storage keys are constant, derived as:
// Timestamp.Now = twox128("Timestamp") ++ twox128("Now")
const TIMESTAMP_NOW_KEY = "0xf0c365c3cf59d671eb72da0e7a4113c49f1f0515f462cdcf84e0f1d6045dfcbb";
// System.Account(pot) = twox128("System") ++ twox128("Account") ++ blake2_128(pot) ++ pot,
// pot = b"modl" ++ b"PotStake" padded to 32 bytes (CollatorSelection PotId, 4EfbaifaUURXh6yej5ch3KBB5hqtdzGxEiMkRAW7XHSMFpQr)
const STAKING_POT = "6d6f646c506f745374616b650000000000000000000000000000000000000000";
const STAKING_POT_ACCOUNT_KEY = "0x26aa394eea5630e07c48ae0c9558cef7b99d880ec681799c0cf30e8886371da95a3fb8de4321e12fad081eaeece61bc5" + STAKING_POT;

async function rpc(method: string, params: any[]) {
  const res = await postURL(RPC, { jsonrpc: "2.0", id: 1, method, params });
  if (res.error) throw new Error(`robonomics rpc ${method} failed: ${JSON.stringify(res.error)}`);
  return res.result;
}

async function rpcBatch(method: string, paramsList: any[][]): Promise<any[]> {
  const res = await postURL(RPC, paramsList.map((params, id) => ({ jsonrpc: "2.0", id, method, params })));
  if (!Array.isArray(res)) throw new Error(`robonomics rpc batch ${method} failed: ${JSON.stringify(res)}`);
  const results: any[] = new Array(paramsList.length);
  for (const r of res) {
    if (r.error) throw new Error(`robonomics rpc ${method} failed: ${JSON.stringify(r.error)}`);
    results[r.id] = r.result;
  }
  return results;
}

// chain_getBlockHash accepts a list of block numbers
const blockHash = async (block: number): Promise<string> => (await rpc("chain_getBlockHash", [[block]]))[0];

async function blockTime(block: number): Promise<number> {
  const value: string | null = await rpc("state_getStorage", [TIMESTAMP_NOW_KEY, await blockHash(block)]);
  if (!value) throw new Error(`robonomics: no timestamp at block ${block}`);
  return Number(Buffer.from(value.slice(2), "hex").readBigUInt64LE(0)) / 1000; // u64 milliseconds
}

type BlockTime = { block: number; time: number };

// smallest block whose timestamp is >= ts, searched between lo (time < ts) and hi (time >= ts)
// by interpolation (blocks are ~6s apart) with a bisection fallback; returns the final bracket
async function firstBlockAtOrAfter(ts: number, lo: BlockTime, hi: BlockTime): Promise<{ lo: BlockTime; hi: BlockTime }> {
  if (hi.time < ts) throw new Error(`robonomics: finalized head ${hi.block} (${hi.time}) is before ${ts}`);
  if (lo.time >= ts) throw new Error(`robonomics: ${ts} is before the staking pot started receiving fees at block ${POT_START_BLOCK}`);
  for (let i = 0; hi.block - lo.block > 1; i++) {
    let next = Math.floor((lo.block + hi.block) / 2);
    if (i % 2 === 0) {
      const guess = lo.block + Math.floor(((ts - lo.time) * (hi.block - lo.block)) / (hi.time - lo.time));
      next = Math.min(hi.block - 1, Math.max(lo.block + 1, guess));
    }
    const time = await blockTime(next);
    if (time < ts) lo = { block: next, time };
    else hi = { block: next, time };
  }
  return { lo, hi };
}

// free balance of the staking pot after each of the given blocks
async function potBalances(blocks: number[]): Promise<bigint[]> {
  const balances: bigint[] = [];
  for (let i = 0; i < blocks.length; i += BATCH_SIZE) {
    const chunk = blocks.slice(i, i + BATCH_SIZE);
    const hashes: string[] = await rpc("chain_getBlockHash", [chunk]);
    const values: (string | null)[] = await rpcBatch("state_getStorage", hashes.map((hash) => [STAKING_POT_ACCOUNT_KEY, hash]));
    values.forEach((value, j) => {
      if (!value) throw new Error(`robonomics: staking pot account missing at block ${chunk[j]}`);
      // AccountInfo { nonce, consumers, providers, sufficients: u32, data: { free, reserved, frozen, flags: u128 } }
      const data = Buffer.from(value.slice(2), "hex");
      balances.push(data.readBigUInt64LE(16) + (data.readBigUInt64LE(24) << 64n));
    });
  }
  return balances;
}

const fetch = async (options: FetchOptions) => {
  const finalizedHash: string = await rpc("chain_getFinalizedHead", []);
  const finalizedBlock = parseInt((await rpc("chain_getHeader", [finalizedHash])).number, 16);
  const head = { block: finalizedBlock, time: await blockTime(finalizedBlock) };
  const potStart = { block: POT_START_BLOCK, time: await blockTime(POT_START_BLOCK) };

  // blocks with startTimestamp <= time < endTimestamp; the end search starts from the start search's lower bound
  const start = await firstBlockAtOrAfter(options.startTimestamp, potStart, head);
  const fromBlock = start.hi.block;
  const toBlock = (await firstBlockAtOrAfter(options.endTimestamp, start.lo, head)).hi.block;
  const blocks = Array.from({ length: toBlock - fromBlock + 1 }, (_, i) => fromBlock - 1 + i);
  const pot = await potBalances(blocks);

  // CollatorSelection pays (pot - ED) / 2 to the block author in on_initialize, then the block's fees and tips are deposited,
  // so the fees of block b = pot(b) - pot(b - 1) + reward(pot(b - 1))
  let fees = 0n;
  for (let i = 1; i < pot.length; i++) {
    const reward = pot[i - 1] > EXISTENTIAL_DEPOSIT ? (pot[i - 1] - EXISTENTIAL_DEPOSIT) / 2n : 0n;
    const blockFees = pot[i] - pot[i - 1] + reward;
    // only fees and tips enter the pot and only the author reward leaves it; anything else would make this wrong, so fail instead
    if (blockFees < 0n) throw new Error(`robonomics: staking pot lost ${-blockFees} planck beyond the author reward at block ${blocks[i]}`);
    fees += blockFees;
  }

  const dailyFees = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const amount = Number(fees) / 10 ** XRT_DECIMALS;
  dailyFees.addCGToken("robonomics-network", amount, METRIC.TRANSACTION_GAS_FEES);
  dailySupplySideRevenue.addCGToken("robonomics-network", amount, "Transaction Gas Fees To Collators");

  return {
    dailyFees,
    dailyRevenue: 0,
    dailySupplySideRevenue,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ROBONOMICS],
  start: "2026-03-19", // first full day after runtime spec 40 started routing fees to the collator staking pot (2026-03-18 14:05 UTC)
  protocolType: ProtocolType.CHAIN,
  methodology: {
    Fees: "Transaction fees and tips paid by users of the Robonomics Polkadot parachain.",
    Revenue: "None: since March 2026 all transaction fees and tips go to collators, nothing is burned or sent to a treasury.",
    SupplySideRevenue: "All transaction fees and tips paid by users, sent to the collator staking pot and paid out to block authors.",
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.TRANSACTION_GAS_FEES]: "Transaction fees and tips paid in XRT by signed extrinsics.",
    },
    SupplySideRevenue: {
      "Transaction Gas Fees To Collators": "All transaction fees and tips, credited to the collator staking pot, which pays half its balance to each block author.",
    },
  },
};

export default adapter;
