import * as sdk from "@defillama/sdk";
import { Interface } from "ethers";
import { FetchOptions, ProtocolType, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import ADDRESSES from "../helpers/coreAssets.json";
import { METRIC } from "../helpers/metrics";

// Elysium (https://elysium.kinetiq.xyz, chain id 99901) is Kinetiq's Arbitrum Nitro chain (stock ArbOS, AnyTrust data
// availability) settling to HyperEVM, with HYPE as the gas token. Genesis block 1 is 2026-10-19 12:00 UTC; public mainnet
// launch was 2026-11-09, earlier days carry real early-access traffic (hundreds of distinct senders a day). `start` is
// 2026-10-21 because DefiLlama's block lookup for elysium begins at block 100 (2026-10-20 10:05 UTC); blocks 1-99 hold
// ~0.002 HYPE of fees.
//
// ArbOS credits every fee straight to a few fixed accounts, so the fees of a window are the balance growth of those accounts
// from the state before the window's first block to the state after its last block. That is ~30 RPC reads per hourly window,
// where receipts would take ~600k eth_getBlockReceipts a day, more than the public node (~7 req/s) can serve.
// - Network and infra fee accounts (ArbOwnerPublic): base fee plus priority fee. "On mainnet, priority fees are collected by
//   the network, not burned" (https://elysium.kinetiq.xyz/docs/blocks-fees-and-ordering); ArbOwnerPublic.getCollectTips() = true.
//   Both are the EOA 0x6cbb552855ce5eb70af49b76a8048be8e3799a05, also the L1 reward recipient, which has never sent a tx (nonce 0
//   on 2026-11-12, ~1,389 HYPE accrued).
// - The L1 pricer funds pool and the batch posters' fee collectors (ArbAggregator): the parent-chain data fee. Elysium prices it
//   at zero ("transactions pay no parent-chain data fee", same docs page; ArbGasInfo.getL1BaseFeeEstimate() = 0), but it was
//   charged before launch and for ~40 minutes on 2026-11-09 (~0.15 HYPE that day). The pool reimburses the batch poster's fee
//   collector, so counting both keeps that flow inside the tracked set.
// Checked against Σ gasUsed × effectiveGasPrice from eth_getBlockReceipts: equal to the wei over 2026-10-31 12:00-13:00 (1,398
// blocks) and block windows on 11-05, 11-09 (data fee on), 11-10 and 11-11, with ArbitrumSubmitRetryableTx (type 0x69) receipts
// left out: their gasUsed is the auto-redeem's gas, which the redeem tx (type 0x68) pays and reports itself.
// A fee account that sends transactions (e.g. a sweep for buybacks) breaks the balance identity in the blocks holding them; those
// blocks are found by nonce bisection and counted from receipts instead.

const ARB_OWNER_PUBLIC = "0x000000000000000000000000000000000000006b"; // ArbOS precompiles: https://docs.arbitrum.io/build-decentralized-apps/precompiles/reference
const ARB_GAS_INFO = "0x000000000000000000000000000000000000006c";
const ARB_AGGREGATOR = "0x000000000000000000000000000000000000006d";
const L1_PRICER_FUNDS_POOL = "0xa4b00000000000000000000000000000000000f6"; // ArbOS system account that collects the parent-chain data fee
const SUBMIT_RETRYABLE_TX_TYPE = "0x69";
const MAX_BLOCKS_WITH_SINK_TXS = 50; // each costs ~25 sequential RPC calls; more means a fee account became an active wallet
const RPC_ATTEMPTS = 5;
const RPC_TIMEOUT_MS = 30_000;
const RATE_LIMIT_ERROR_CODE = -32017;

const BUILDERS_SHARE_PERCENT = 25n;
const KNTQ_BUYBACK_SHARE_PERCENT = 50n;

const LABELS = {
  BUILDERS: "Gas Fees To Builders",
  BUYBACKS: "Gas Fees To KNTQ Buybacks",
  OPERATIONS: "Gas Fees To Protocol Operations",
};

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

async function getFeesWei(options: FetchOptions): Promise<bigint> {
  const chain = options.chain;
  const fromBlock = await options.getFromBlock();
  const toBlock = await options.getToBlock();
  const stateBlock = fromBlock - 1;
  if (stateBlock > toBlock) throw new Error(`${chain}: invalid block window ${fromBlock}-${toBlock}`);
  if (stateBlock === toBlock) return 0n; // no block was produced in the window (Elysium only makes blocks when there are txs)

  const sinks = [...new Set([...await getFeeSinks(chain, stateBlock), ...await getFeeSinks(chain, toBlock)])];
  const sinkSet = new Set(sinks);

  let feesWei = await getTotalBalance(chain, sinks, toBlock) - await getTotalBalance(chain, sinks, stateBlock);

  const blocksWithSinkTxs = new Set<number>();
  for (const sink of sinks) {
    const nonceBefore = await getNonce(chain, sink, stateBlock);
    const nonceAfter = await getNonce(chain, sink, toBlock);
    if (nonceAfter > 0) {
      const code = await rpcCall(chain, "eth_getCode", [sink, toHex(toBlock)]);
      if (code && code !== "0x") throw new Error(`${chain}: fee account ${sink} has code at block ${toBlock}, its balance no longer tracks fees`);
    }
    if (nonceAfter === nonceBefore) continue;
    const blocks = await getBlocksWithNonceChange(chain, sink, stateBlock, toBlock, nonceBefore, nonceAfter);
    blocks.forEach((block) => blocksWithSinkTxs.add(block));
    if (blocksWithSinkTxs.size > MAX_BLOCKS_WITH_SINK_TXS)
      throw new Error(`${chain}: fee accounts sent transactions in more than ${MAX_BLOCKS_WITH_SINK_TXS} blocks between ${fromBlock} and ${toBlock}`);
  }

  for (const block of blocksWithSinkTxs) {
    const balanceChange = await getTotalBalance(chain, sinks, block) - await getTotalBalance(chain, sinks, block - 1);
    feesWei += await getBlockFeesFromReceipts(chain, block, sinkSet) - balanceChange;
  }

  if (feesWei < 0n) throw new Error(`${chain}: fee accounts lost ${feesWei} wei between blocks ${fromBlock} and ${toBlock}`);
  return feesWei;
}

const fetchFees = async (options: FetchOptions) => {
  const feesWei = await getFeesWei(options);
  const buildersWei = feesWei * BUILDERS_SHARE_PERCENT / 100n;
  const buybacksWei = feesWei * KNTQ_BUYBACK_SHARE_PERCENT / 100n;
  const operationsWei = feesWei - buildersWei - buybacksWei;

  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();

  dailyFees.addGasToken(feesWei, METRIC.TRANSACTION_GAS_FEES);
  dailySupplySideRevenue.addGasToken(buildersWei, LABELS.BUILDERS);
  dailyRevenue.addGasToken(buybacksWei, LABELS.BUYBACKS);
  dailyRevenue.addGasToken(operationsWei, LABELS.OPERATIONS);
  dailyHoldersRevenue.addGasToken(buybacksWei, METRIC.TOKEN_BUY_BACK);
  dailyProtocolRevenue.addGasToken(operationsWei, LABELS.OPERATIONS);

  return { dailyFees, dailyRevenue, dailySupplySideRevenue, dailyHoldersRevenue, dailyProtocolRevenue };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch: fetchFees,
  chains: [CHAIN.ELYSIUM],
  start: "2026-10-21",
  protocolType: ProtocolType.CHAIN,
  methodology: {
    Fees: "Gas fees paid in HYPE for transactions on Elysium, base fee and priority fee, plus the small parent-chain data fee charged before the 2026-11-09 launch and briefly on launch day.",
    Revenue: "75% of Elysium gas fees: the 50% Kinetiq allocates to KNTQ buybacks and the 25% it keeps for protocol operations.",
    SupplySideRevenue: "25% of Elysium gas fees, which Kinetiq shares with the builders whose apps drive blockspace demand.",
    HoldersRevenue: "50% of Elysium gas fees, which Kinetiq allocates to buying KNTQ on the open market; the bought KNTQ is sent to the Hyperliquid Assistance Fund.",
    ProtocolRevenue: "25% of Elysium gas fees, kept by Kinetiq for protocol operations.",
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.TRANSACTION_GAS_FEES]: "Gas fees paid by Elysium users, measured as the growth of the accounts ArbOS credits fees to (network and infra fee accounts, the parent-chain data fee pool and the batch poster's fee collector).",
    },
    Revenue: {
      [LABELS.BUYBACKS]: "50% of gas fees, allocated to open-market KNTQ buybacks.",
      [LABELS.OPERATIONS]: "25% of gas fees, kept for protocol operations.",
    },
    SupplySideRevenue: {
      [LABELS.BUILDERS]: "25% of gas fees, shared with builders whose apps drive blockspace demand.",
    },
    HoldersRevenue: {
      [METRIC.TOKEN_BUY_BACK]: "50% of gas fees, used to buy KNTQ on the open market and sent to the Hyperliquid Assistance Fund.",
    },
    ProtocolRevenue: {
      [LABELS.OPERATIONS]: "25% of gas fees, kept by Kinetiq for protocol operations.",
    },
  },
};

export default adapter;
