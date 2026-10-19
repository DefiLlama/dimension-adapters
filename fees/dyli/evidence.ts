import axios from "axios";
import { Interface, zeroPadValue } from "ethers";
import { FetchOptions } from "../../adapters/types";
import ADDRESSES from "../../helpers/coreAssets.json";
import { getTransactionsWithRetry, getTxReceiptsWithRetry } from "../../helpers/getTxReceipts";

// Public evidence contains transaction hashes and amounts, never Stripe/customer identifiers.
const EVIDENCE_API = "https://www.dyli.io/api/public/defillama";
const TRANSFER_EVENT = "event Transfer(address indexed from, address indexed to, uint256 value)";
const transfers = new Interface([TRANSFER_EVENT]);
// Relay solver: https://docs.relay.link/references/api/api_resources/contract-addresses
const RELAY_SOLVER = "0xf70da97812cb96acdf810712aa562db8dfa3dbef";
const sourceChains: Record<number, { chain: string; usdc: string }> = {
  1: { chain: "ethereum", usdc: ADDRESSES.ethereum.USDC },
  2741: { chain: "abstract", usdc: ADDRESSES.abstract.USDC },
  8453: { chain: "base", usdc: ADDRESSES.base.USDC },
};
const HASH = /^0x[\da-f]{64}$/i;

/** Identify one Relay transfer using normalized SDK/RPC log-index metadata. */
function bridgeTransferKey(log: any) {
  const sender = String(log.args.from).toLowerCase();
  if (sender !== RELAY_SOLVER) return undefined;
  const rawIndex = log.logIndex ?? log.index;
  const index = typeof rawIndex === "number" ? rawIndex
    : typeof rawIndex === "string" && /^(?:\d+|0x[\da-f]+)$/i.test(rawIndex) ? Number(rawIndex) : NaN;
  if (!Number.isSafeInteger(index) || index < 0) throw new Error("DYLI bridge transfer log index is missing or invalid");
  return `${String(log.transactionHash).toLowerCase()}:${sender}:${String(log.args.to).toLowerCase()}:${index}`;
}

/** Fetch USDC receipts for the configured payment wallets, retaining transaction metadata. */
export async function getPaymentLogs(options: FetchOptions, usdc: string, targets: string[]) {
  const logs = await Promise.all(targets.map((target) => options.getLogs({
    target: usdc,
    eventAbi: TRANSFER_EVENT,
    topics: [transfers.getEvent("Transfer")!.topicHash, null as any, zeroPadValue(target, 32)],
    onlyArgs: false,
    parseLog: true,
  })));
  return logs.flat();
}

/**
 * Exclude internal bridges using the endpoint's exact source-to-deposit binding,
 * then independently verify source funding. See ./bridge-evidence.md for the
 * public endpoint contract and archived migration provenance.
 */
export async function excludeInternalBridges(options: FetchOptions, logs: any[], internal: Set<string>) {
  const excluded = new Set<string>();
  const candidates = new Map<string, { hash: string; recipient: string }>();
  const byDestination = new Map<string, string>();
  for (const log of logs) {
    const key = bridgeTransferKey(log);
    if (!key) continue;
    const hash = String(log.transactionHash).toLowerCase();
    const recipient = String(log.args.to).toLowerCase();
    const destination = `${hash}:${recipient}`;
    // Evidence is transaction/recipient-scoped, so it cannot attribute two distinct
    // Relay logs for that same destination. Do not reuse one proof for both.
    const previous = byDestination.get(destination);
    if (previous && previous !== key) throw new Error("DYLI bridge evidence cannot distinguish multiple Relay transfers");
    byDestination.set(destination, key);
    candidates.set(key, { hash, recipient });
  }
  for (const [key, { hash, recipient }] of candidates) {
    const { data } = await axios.get(EVIDENCE_API, {
      params: { chainId: options.chain === "base" ? 8453 : 2741, transactionHash: hash, recipient }, timeout: 30000,
    });
    if (data.version !== 1 || data.transactionHash !== hash || data.recipient !== recipient ||
        data.chainId !== (options.chain === "base" ? 8453 : 2741) || typeof data.internalTransfer !== "boolean")
      throw new Error("DYLI bridge evidence does not match the transfer");
    if (!data.internalTransfer) continue;
    // The endpoint binds this source to the destination tuple checked above.
    // The receipt/transaction checks below establish ownership, not that binding.
    const source = sourceChains[data.sourceChainId];
    if (!source || !HASH.test(data.sourceTransactionHash)) throw new Error("DYLI bridge source is missing");
    const [receipt] = await getTxReceiptsWithRetry(source.chain, [data.sourceTransactionHash]);
    if (!receipt) throw new Error("DYLI bridge source receipt is missing");
    if (Number(receipt.status) !== 1) throw new Error("DYLI bridge source transaction failed");
    let fundedByDyli = receipt.logs.some((sourceLog: any) => {
      if (String(sourceLog.address).toLowerCase() !== source.usdc.toLowerCase()) return false;
      const parsed = transfers.parseLog(sourceLog);
      return parsed && internal.has(String(parsed.args.from).toLowerCase()) && BigInt(parsed.args.value) > 0n;
    });
    // Some treasury bridges send native ETH and receive USDC on the destination chain.
    if (!fundedByDyli) {
      const [transaction] = await getTransactionsWithRetry(source.chain, [data.sourceTransactionHash]);
      if (!transaction) throw new Error("DYLI bridge source transaction is missing");
      fundedByDyli = internal.has(String(transaction.from).toLowerCase()) && BigInt(transaction.value) > 0n;
    }
    if (!fundedByDyli) throw new Error("DYLI bridge source is not an internal transfer");
    excluded.add(key);
  }
  return (log: any) => {
    const key = bridgeTransferKey(log);
    return key !== undefined && excluded.has(key);
  };
}

/** Sum verified Stripe goods amounts only after matching evidence to onchain Bought events. */
export async function getStripePackSales(options: FetchOptions, boughtLogs: any[], internal: Set<string>) {
  const candidates = boughtLogs.filter(log => Number(log.args.paymentMode) === 1 && BigInt(log.args.grossAmount) > 0n
    && !internal.has(String(log.args.user).toLowerCase()));
  if (!candidates.length) return 0n;
  const byReference = new Map(candidates.map(log => [String(log.args.paymentReference).toLowerCase(), log]));
  const seen = new Set<string>();
  let amount = 0n;
  const fromBlock = await options.getFromBlock(), toBlock = await options.getToBlock();
  // The public endpoint caps a request at one day of Base blocks.
  for (let from = fromBlock; from <= toBlock; from += 43200) {
    const to = Math.min(toBlock, from + 43199);
    const { data } = await axios.get(EVIDENCE_API, {
      params: { chainId: 8453, fromBlock: from, toBlock: to }, timeout: 30000,
    });
    if (data.version !== 1 || data.chainId !== 8453 || data.fromBlock !== from || data.toBlock !== to ||
        data.complete !== true || !Array.isArray(data.stripeSales)) throw new Error("Incomplete DYLI Stripe evidence");
    for (const sale of data.stripeSales) {
      const log = byReference.get(sale.paymentReference);
      if (!log || sale.transactionHash !== String(log.transactionHash).toLowerCase() ||
          sale.blockNumber !== Number(log.blockNumber) || sale.blockNumber < from || sale.blockNumber > to ||
          sale.grossAmount !== String(log.args.grossAmount) || typeof sale.recognizedAmount !== "string" || !/^\d+$/.test(sale.recognizedAmount) ||
          BigInt(sale.recognizedAmount) > BigInt(log.args.grossAmount) || seen.has(sale.paymentReference))
        throw new Error("DYLI Stripe evidence does not match Bought events");
      seen.add(sale.paymentReference);
      amount += BigInt(sale.recognizedAmount);
    }
  }
  return amount;
}
