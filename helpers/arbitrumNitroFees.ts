import * as sdk from "@defillama/sdk";
import { Interface } from "ethers";
import { FetchOptions } from "../adapters/types";
import ADDRESSES from "./coreAssets.json";

// Gas fees of an Arbitrum Nitro (Orbit) chain, from balances instead of receipts (used by fees/elysium.ts and fees/edu-chain.ts).
// ArbOS credits every fee straight to a few fixed accounts, so the fees of a window are the balance growth of those accounts
// from the state before the window's first block to the state after its last block. That is ~30 RPC reads per hourly window,
// where receipts need one eth_getBlockReceipts per block, more than the keyless Conduit nodes these chains run on (~7 req/s) can serve.
// - Network and infra fee accounts (ArbOwnerPublic): base fee plus priority fee (when the chain collects tips).
// - The L1 reward recipient (ArbGasInfo), the L1 pricer funds pool and the batch posters' fee collectors (ArbAggregator): the
//   parent-chain data fee. The pool reimburses the batch poster's fee collector, so counting both keeps that flow inside the tracked set.
// The accounts are read at both ends of the window, so a window in which the chain owner switches fee account tracks both.
// ArbitrumSubmitRetryableTx (type 0x69) receipts are left out wherever receipts are read: their gasUsed is the auto-redeem's gas,
// which the redeem tx (type 0x68) pays and reports itself.
// A fee account that sends transactions (e.g. a sweep, or the chain owner's setup calls) breaks the balance identity in the
// blocks holding them; those blocks are found by nonce bisection and counted from receipts instead, leaving out the fees the
// fee accounts paid themselves.

const ARB_OWNER_PUBLIC = "0x000000000000000000000000000000000000006b"; // ArbOS precompiles: https://docs.arbitrum.io/build-decentralized-apps/precompiles/reference
const ARB_GAS_INFO = "0x000000000000000000000000000000000000006c";
const ARB_AGGREGATOR = "0x000000000000000000000000000000000000006d";
const L1_PRICER_FUNDS_POOL = "0xa4b00000000000000000000000000000000000f6"; // ArbOS system account that collects the parent-chain data fee
const SUBMIT_RETRYABLE_TX_TYPE = "0x69";
const MAX_BLOCKS_WITH_SINK_TXS = 50; // each costs ~25 sequential RPC calls; more means a fee account became an active wallet
const RPC_ATTEMPTS = 5;
const RPC_TIMEOUT_MS = 30_000;
const RATE_LIMIT_ERROR_CODE = -32017;
const REWARD_DISTRIBUTOR_PER_RECIPIENT_GAS_SELECTOR = "0xdc55beee";
const REWARD_DISTRIBUTOR_RECIPIENT_RECIEVED_TOPIC = "0x8b2a2b28e169eb0e4f62578e9d12f747d7bd0fe1ebc935af28387c18034d7cc0";
const REWARD_DISTRIBUTOR_OWNER_RECIEVED_TOPIC = "0xf3b03d863408466d72337e3dd8e40d5b9a37c5ef4c274f40dd3542d87697ab7e";
const REWARD_DISTRIBUTOR_RECIPIENTS_UPDATED_TOPIC = "0x33bc54b3c50e54df666d4399528026a4b04671bb2a879281b5279f7352fb3e6c";
const REWARD_DISTRIBUTOR_OWNERSHIP_TRANSFERRED_TOPIC = "0x8be0079c531659141344cd1fd0a4f28419497f9722a3daafe3b4186f6b6457e0";
const REWARD_DISTRIBUTOR_PAID_OUT_TOPICS = [REWARD_DISTRIBUTOR_RECIPIENT_RECIEVED_TOPIC, REWARD_DISTRIBUTOR_OWNER_RECIEVED_TOPIC];
const REWARD_DISTRIBUTOR_NO_PAYMENT_TOPICS = [REWARD_DISTRIBUTOR_RECIPIENTS_UPDATED_TOPIC, REWARD_DISTRIBUTOR_OWNERSHIP_TRANSFERRED_TOPIC];
const MAX_LOG_RANGE = 50_000;

const arbOsInterface = new Interface([
  "function getNetworkFeeAccount() view returns (address)", // ArbOwnerPublic
  "function getInfraFeeAccount() view returns (address)", // ArbOwnerPublic
  "function getL1RewardRecipient() view returns (address)", // ArbGasInfo
  "function getBatchPosters() view returns (address[])", // ArbAggregator
  "function getFeeCollector(address batchPoster) view returns (address)", // ArbAggregator
]);

const toHex = (value: number) => `0x${value.toString(16)}`;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function rpcCall(chain: string, method: string, params: any[]): Promise<any> {
  const urls: string[] = ((sdk.getProvider(chain) as any)?.rpcs ?? []).map((rpc: { url: string }) => rpc.url);
  if (!urls.length) throw new Error(`${chain}: no RPC configured for ${method}`);
  let lastError: any;
  for (const url of urls) {
    for (let attempt = 1; attempt <= RPC_ATTEMPTS; attempt++) {
      let retry = true;
      try {
        const response = await fetch(url, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
          signal: AbortSignal.timeout(RPC_TIMEOUT_MS),
        });
        const payload = response.status === 429 ? undefined : await response.json();
        if (payload && !payload.error) return payload.result;
        if (payload && payload.error.code !== RATE_LIMIT_ERROR_CODE) retry = false;
        lastError = new Error(`${method} failed on ${url}: ${payload ? JSON.stringify(payload.error) : "HTTP 429"}`);
      } catch (error) {
        lastError = error; // timeout, network error or a non-JSON body: retry
      }
      if (!retry) break;
      await sleep(1000 * attempt);
    }
  }
  throw lastError;
}

async function callArbOs(chain: string, block: number, target: string, functionName: string, args: any[] = []): Promise<any> {
  const data = arbOsInterface.encodeFunctionData(functionName, args);
  const result = await rpcCall(chain, "eth_call", [{ to: target, data }, toHex(block)]);
  return arbOsInterface.decodeFunctionResult(functionName, result)[0];
}

// Every account ArbOS pays fees into at a block: fee accounts, L1 reward recipient, L1 pricer pool, batch posters' fee collectors
async function getFeeSinks(chain: string, block: number): Promise<string[]> {
  const sinks: string[] = [
    await callArbOs(chain, block, ARB_OWNER_PUBLIC, "getNetworkFeeAccount"),
    await callArbOs(chain, block, ARB_OWNER_PUBLIC, "getInfraFeeAccount"),
    await callArbOs(chain, block, ARB_GAS_INFO, "getL1RewardRecipient"),
    L1_PRICER_FUNDS_POOL,
  ];
  for (const batchPoster of await callArbOs(chain, block, ARB_AGGREGATOR, "getBatchPosters"))
    sinks.push(await callArbOs(chain, block, ARB_AGGREGATOR, "getFeeCollector", [batchPoster]));
  return sinks
    .map((address) => address.toLowerCase())
    .filter((address) => address !== ADDRESSES.null);
}

async function getTotalBalance(chain: string, sinks: string[], block: number): Promise<bigint> {
  let total = 0n;
  for (const sink of sinks) total += BigInt(await rpcCall(chain, "eth_getBalance", [sink, toHex(block)]));
  return total;
}

async function getNonce(chain: string, account: string, block: number): Promise<number> {
  return Number(await rpcCall(chain, "eth_getTransactionCount", [account, toHex(block)]));
}

// Blocks in (stateBlock, toBlock] whose post-state nonce of the account is higher than the previous block's
async function getBlocksWithNonceChange(chain: string, account: string, stateBlock: number, toBlock: number, fromNonce: number, toNonce: number) {
  const blocks: number[] = [];
  const bisect = async (low: number, high: number, lowNonce: number, highNonce: number): Promise<void> => {
    if (lowNonce === highNonce) return;
    if (high - low === 1) {
      blocks.push(high);
      return;
    }
    const middle = Math.floor((low + high) / 2);
    const middleNonce = await getNonce(chain, account, middle);
    await bisect(low, middle, lowNonce, middleNonce);
    await bisect(middle, high, middleNonce, highNonce);
  };
  await bisect(stateBlock, toBlock, fromNonce, toNonce);
  return blocks;
}

async function getBlockFeesFromReceipts(chain: string, block: number, sinks: Set<string>): Promise<bigint> {
  const receipts = await rpcCall(chain, "eth_getBlockReceipts", [toHex(block)]);
  if (!Array.isArray(receipts)) throw new Error(`${chain}: eth_getBlockReceipts returned no receipts for block ${block}`);
  return receipts.reduce((total: bigint, receipt: any) => {
    if (receipt.type === SUBMIT_RETRYABLE_TX_TYPE || sinks.has(receipt.from.toLowerCase())) return total;
    return total + BigInt(receipt.gasUsed) * BigInt(receipt.effectiveGasPrice);
  }, 0n);
}

async function isRewardDistributor(chain: string, account: string, block: number): Promise<boolean> {
  try {
    const perRecipientGas = await rpcCall(chain, "eth_call", [{ to: account, data: REWARD_DISTRIBUTOR_PER_RECIPIENT_GAS_SELECTOR }, toHex(block)]);
    return typeof perRecipientGas === "string" && perRecipientGas !== "0x" && BigInt(perRecipientGas) > 0n;
  } catch {
    return false;
  }
}

async function getPaidOutWei(chain: string, distributors: string[], sinks: Set<string>, fromBlock: number, toBlock: number): Promise<bigint> {
  let paidOut = 0n;
  for (let start = fromBlock; start <= toBlock; start += MAX_LOG_RANGE) {
    const end = Math.min(start + MAX_LOG_RANGE - 1, toBlock);
    const logs = await rpcCall(chain, "eth_getLogs", [{ address: distributors, fromBlock: toHex(start), toBlock: toHex(end) }]);
    if (!Array.isArray(logs)) throw new Error(`${chain}: eth_getLogs returned no logs for blocks ${start}-${end}`);
    for (const log of logs) {
      const topic = String(log.topics?.[0] ?? "").toLowerCase();
      if (REWARD_DISTRIBUTOR_NO_PAYMENT_TOPICS.includes(topic)) continue;
      if (!REWARD_DISTRIBUTOR_PAID_OUT_TOPICS.includes(topic))
        throw new Error(`${chain}: fee account ${log.address} emitted ${topic} in block ${Number(log.blockNumber)}, its balance no longer tracks fees`);
      if (log.topics.slice(1).some((indexed: string) => sinks.has(`0x${indexed.slice(-40)}`.toLowerCase()))) continue;
      paidOut += BigInt(log.data.slice(0, 66));
    }
  }
  return paidOut;
}

// Gas fees in wei (native gas token) paid in the blocks of the window: options.getFromBlock() is the block after the previous window's last block
export async function getArbitrumNitroFeesWei(options: FetchOptions): Promise<bigint> {
  const chain = options.chain;
  const fromBlock = await options.getFromBlock();
  const toBlock = await options.getToBlock();
  const stateBlock = fromBlock - 1;
  if (stateBlock > toBlock) throw new Error(`${chain}: invalid block window ${fromBlock}-${toBlock}`);
  if (stateBlock === toBlock) return 0n; // no block was produced in the window (Nitro chains only make blocks when there are txs)

  const sinks = [...new Set([...await getFeeSinks(chain, stateBlock), ...await getFeeSinks(chain, toBlock)])];
  const sinkSet = new Set(sinks);

  let feesWei = await getTotalBalance(chain, sinks, toBlock) - await getTotalBalance(chain, sinks, stateBlock);

  const blocksWithSinkTxs = new Set<number>();
  const distributors: string[] = [];
  for (const sink of sinks) {
    const nonceBefore = await getNonce(chain, sink, stateBlock);
    const nonceAfter = await getNonce(chain, sink, toBlock);
    if (nonceAfter > 0) {
      const code = await rpcCall(chain, "eth_getCode", [sink, toHex(toBlock)]);
      if (code && code !== "0x") {
        if (nonceAfter !== nonceBefore)
          throw new Error(`${chain}: fee account ${sink} deployed a contract between blocks ${fromBlock} and ${toBlock}, its balance no longer tracks fees`);
        if (!(await isRewardDistributor(chain, sink, toBlock)))
          throw new Error(`${chain}: fee account ${sink} has code at block ${toBlock} and is not a RewardDistributor, its balance no longer tracks fees`);
        distributors.push(sink);
        continue;
      }
    }
    if (nonceAfter === nonceBefore) continue;
    const blocks = await getBlocksWithNonceChange(chain, sink, stateBlock, toBlock, nonceBefore, nonceAfter);
    blocks.forEach((block) => blocksWithSinkTxs.add(block));
    if (blocksWithSinkTxs.size > MAX_BLOCKS_WITH_SINK_TXS)
      throw new Error(`${chain}: fee accounts sent transactions in more than ${MAX_BLOCKS_WITH_SINK_TXS} blocks between ${fromBlock} and ${toBlock}`);
  }

  if (distributors.length) feesWei += await getPaidOutWei(chain, distributors, sinkSet, fromBlock, toBlock);

  for (const block of blocksWithSinkTxs) {
    const balanceChange = await getTotalBalance(chain, sinks, block) - await getTotalBalance(chain, sinks, block - 1);
    feesWei += await getBlockFeesFromReceipts(chain, block, sinkSet) - balanceChange;
  }

  if (feesWei < 0n) throw new Error(`${chain}: fee accounts lost ${feesWei} wei between blocks ${fromBlock} and ${toBlock}`);
  return feesWei;
}
