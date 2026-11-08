import { FetchOptions, ProtocolType, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";
import { postURL } from "../utils/fetchURL";

const RPC = "https://karura-rpc.aca-api.network";
const KAR_DECIMALS = 12;

// storage keys are constant, derived as:
// Timestamp.Now = twox128("Timestamp") ++ twox128("Now")
const TIMESTAMP_NOW_KEY = "0xf0c365c3cf59d671eb72da0e7a4113c49f1f0515f462cdcf84e0f1d6045dfcbb";
// System.Account(pot) = twox128("System") ++ twox128("Account") ++ blake2_128(pot) ++ pot,
// pot = b"modl" ++ b"aca/reve" padded to 32 bytes (PalletId::into_account_truncating)
const TREASURY_RESERVE = "6d6f646c6163612f726576650000000000000000000000000000000000000000";
const TREASURY_RESERVE_ACCOUNT_KEY = "0x26aa394eea5630e07c48ae0c9558cef7b99d880ec681799c0cf30e8886371da9a5ef6986d1cc2a94badd2ed9ccfba352" + TREASURY_RESERVE;

async function rpc(method: string, params: any[]) {
  const res = await postURL(RPC, { jsonrpc: "2.0", id: 1, method, params });
  if (res.error) throw new Error(`karura rpc ${method} failed: ${JSON.stringify(res.error)}`);
  return res.result;
}

const blockHash = (block: number): Promise<string> => rpc("chain_getBlockHash", [block]);

async function blockTime(block: number): Promise<number> {
  const value: string | null = await rpc("state_getStorage", [TIMESTAMP_NOW_KEY, await blockHash(block)]);
  if (!value) throw new Error(`karura: no timestamp at block ${block}`);
  return Number(Buffer.from(value.slice(2), "hex").readBigUInt64LE(0)) / 1000; // u64 milliseconds
}

// AccountInfo { nonce, consumers, providers, sufficients: u32, data: { free, reserved, frozen, flags: u128 } }
async function potBalance(block: number): Promise<bigint> {
  const value: string | null = await rpc("state_getStorage", [TREASURY_RESERVE_ACCOUNT_KEY, await blockHash(block)]);
  if (!value) throw new Error(`karura: treasury reserve account missing at block ${block}`);
  const data = Buffer.from(value.slice(2), "hex");
  const u128 = (offset: number) => data.readBigUInt64LE(offset) + (data.readBigUInt64LE(offset + 8) << 64n);
  return u128(16) + u128(32); // free + reserved
}

// smallest block whose timestamp is >= ts, by interpolation search (blocks are ~12s apart) with a bisection fallback
async function firstBlockAtOrAfter(ts: number, head: { block: number; time: number }) {
  if (head.time < ts) throw new Error(`karura: finalized head ${head.block} (${head.time}) is before ${ts}`);
  let lo = { block: 1, time: await blockTime(1) };
  let hi = head;
  if (lo.time >= ts) return lo.block;
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
  return hi.block;
}

const fetch = async (options: FetchOptions) => {
  const finalizedHash: string = await rpc("chain_getFinalizedHead", []);
  const finalizedBlock = parseInt((await rpc("chain_getHeader", [finalizedHash])).number, 16);
  const head = { block: finalizedBlock, time: await blockTime(finalizedBlock) };

  // the balance after the last block before each boundary covers blocks with startTimestamp <= time < endTimestamp
  const fromBlock = (await firstBlockAtOrAfter(options.startTimestamp, head)) - 1;
  const toBlock = (await firstBlockAtOrAfter(options.endTimestamp, head)) - 1;
  const fees = (await potBalance(toBlock)) - (await potBalance(fromBlock));
  // a decrease can only be a root dispatch spending from the pot, which would understate fees; fail instead of storing it
  if (fees < 0n) throw new Error(`karura: treasury reserve balance fell by ${-fees} planck between blocks ${fromBlock} and ${toBlock}`);

  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const amount = Number(fees) / 10 ** KAR_DECIMALS;
  dailyFees.addCGToken("karura", amount, METRIC.TRANSACTION_GAS_FEES);
  dailyRevenue.addCGToken("karura", amount, "Transaction Gas Fees To Treasury");

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue.clone(),
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.KARURA],
  start: "2023-09-07", // first full day after runtime 2200 started routing fees to the treasury reserve (2023-09-06 03:04 UTC)
  protocolType: ProtocolType.CHAIN,
  methodology: {
    Fees: "Transaction fees and tips paid by users of the Karura network.",
    Revenue: "All transaction fees and tips paid by users, which the Karura runtime sends to its treasury reserve; nothing is burned.",
    ProtocolRevenue: "All transaction fees and tips paid by users, sent to the Karura treasury reserve account.",
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.TRANSACTION_GAS_FEES]: "Transaction fees and tips paid in KAR (fees paid in other tokens are swapped to KAR first).",
    },
    Revenue: {
      "Transaction Gas Fees To Treasury": "All transaction fees and tips, credited to the treasury reserve pot.",
    },
    ProtocolRevenue: {
      "Transaction Gas Fees To Treasury": "All transaction fees and tips, credited to the treasury reserve pot.",
    },
  },
};

export default adapter;
