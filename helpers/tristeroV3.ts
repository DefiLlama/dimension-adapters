import { Balances } from "@defillama/sdk";
import { AbiCoder, Interface } from "ethers";
import { FetchOptions } from "../adapters/types";
import { CHAIN } from "./chains";
import getTxReceipts, { getTransactions } from "./getTxReceipts";

export const ERC20_TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

export type TristeroV3ChainConfig = {
  start: string;
  router: string;
  escrow: string;
  includedOrderTypes: string[];
};

export type TristeroV3TransferLog = {
  address: string;
  data: string;
  topics?: string[];
  transactionHash?: string;
  transaction_hash?: string;
  txHash?: string;
  logIndex?: string | number;
  log_index?: string | number;
  index?: string | number;
};

type TristeroV3DecodedOrder = {
  orderType: string;
  srcToken: string;
  srcQuantity: bigint;
  customData: string;
};

type TristeroV3Transaction = {
  hash?: string | null;
  from?: string | null;
  to?: string | null;
  data?: string;
  input?: string;
};

type TristeroV3Receipt = {
  hash?: string;
  transactionHash?: string;
  logs?: readonly TristeroV3TransferLog[];
};

export const TRISTERO_V3_VOLUME_CONFIGS: Record<string, TristeroV3ChainConfig> = {
  [CHAIN.ARBITRUM]: {
    start: "2026-05-21",
    router: "0x739DfF607F5303a2EB4D2271d11AEC6f642f6480",
    escrow: "0x969D1eAb4C39706692d14894924245ca1Fe7cBCe",
    includedOrderTypes: ["TAKER", "CROSS", "MARGIN"],
  },
  [CHAIN.BASE]: {
    start: "2026-05-21",
    router: "0x739DfF607F5303a2EB4D2271d11AEC6f642f6480",
    escrow: "0x969D1eAb4C39706692d14894924245ca1Fe7cBCe",
    includedOrderTypes: ["TAKER", "CROSS", "MARGIN"],
  },
} as const;

const ORDER_ROUTER_ABI = [
  {
    type: "function",
    name: "send",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "order",
        type: "tuple",
        components: [
          { name: "sender", type: "address" },
          {
            name: "parameters",
            type: "tuple",
            components: [
              { name: "srcAsset", type: "address" },
              { name: "dstAsset", type: "address" },
              { name: "srcQuantity", type: "uint256" },
              { name: "dstQuantity", type: "uint256" },
              { name: "minQuantity", type: "uint256" },
              { name: "darkSalt", type: "uint128" },
            ],
          },
          { name: "deadline", type: "uint256" },
          { name: "target", type: "address" },
          { name: "filler", type: "address" },
          { name: "orderType", type: "string" },
          { name: "customData", type: "bytes" },
        ],
      },
      {
        name: "payload",
        type: "tuple",
        components: [
          { name: "nonce", type: "uint256" },
          { name: "signature", type: "bytes" },
        ],
      },
      {
        name: "arb",
        type: "tuple",
        components: [
          { name: "multicallTarget", type: "address" },
          {
            name: "calls",
            type: "tuple[]",
            components: [
              { name: "target", type: "address" },
              { name: "allowFailure", type: "bool" },
              { name: "value", type: "uint256" },
              { name: "callData", type: "bytes" },
            ],
          },
          { name: "refundTo", type: "address" },
          { name: "nftRecipient", type: "address" },
        ],
      },
      { name: "minOut", type: "uint256" },
      {
        name: "v",
        type: "tuple",
        components: [
          { name: "vault", type: "address" },
          {
            name: "permit",
            type: "tuple",
            components: [
              {
                name: "permitted",
                type: "tuple",
                components: [
                  { name: "token", type: "address" },
                  { name: "amount", type: "uint256" },
                ],
              },
              { name: "nonce", type: "uint256" },
              { name: "deadline", type: "uint256" },
            ],
          },
          { name: "signature", type: "bytes" },
        ],
      },
    ],
  },
] as const;

const ORDER_ROUTER_INTERFACE = new Interface(ORDER_ROUTER_ABI);
const ABI_CODER = AbiCoder.defaultAbiCoder();

const ESCROW_ABI = [
  {
    type: "function",
    name: "close",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "order",
        type: "tuple",
        components: [
          { name: "positionId", type: "uint128" },
          { name: "sharesToClose", type: "uint256" },
          { name: "minOut", type: "uint256" },
          { name: "deadline", type: "uint256" },
          { name: "permit2Nonce", type: "uint256" },
        ],
      },
      { name: "signature", type: "bytes" },
      {
        name: "arb",
        type: "tuple",
        components: [
          { name: "multicallTarget", type: "address" },
          {
            name: "calls",
            type: "tuple[]",
            components: [
              { name: "target", type: "address" },
              { name: "allowFailure", type: "bool" },
              { name: "value", type: "uint256" },
              { name: "callData", type: "bytes" },
            ],
          },
          { name: "refundTo", type: "address" },
          { name: "nftRecipient", type: "address" },
        ],
      },
    ],
  },
] as const;

const ESCROW_INTERFACE = new Interface(ESCROW_ABI);
const ZERO_TOPIC_ADDRESS = topicAddress("0x0000000000000000000000000000000000000000");

export function getTristeroV3Chains(): string[] {
  return Object.keys(TRISTERO_V3_VOLUME_CONFIGS);
}

export function topicAddress(address: string): string {
  return `0x${address.toLowerCase().replace(/^0x/, "").padStart(64, "0")}`;
}

function normalize(value?: string | null): string {
  return value?.toLowerCase() ?? "";
}

function getTxHash(log: TristeroV3TransferLog): string | undefined {
  return log.transactionHash ?? log.transaction_hash ?? log.txHash;
}

function getReceiptTxHash(receipt: TristeroV3Receipt): string | undefined {
  return receipt.transactionHash ?? receipt.hash ?? getTxHash(receipt.logs?.[0] as TristeroV3TransferLog);
}

function isNonZeroBytes32(value: string): boolean {
  if (!/^0x[0-9a-fA-F]{64}$/.test(value)) return false;
  return BigInt(value) > 0n;
}

function isIncludedOrderType(orderType: string, includedOrderTypes: string[]): boolean {
  return includedOrderTypes.includes(orderType.toUpperCase());
}

function isRouterTransaction(tx: TristeroV3Transaction | null, router: string): boolean {
  return normalize(tx?.to) === normalize(router);
}

export function decodeTristeroV3SendOrder(data?: string): TristeroV3DecodedOrder | null {
  if (!data) return null;

  try {
    const parsed = ORDER_ROUTER_INTERFACE.parseTransaction({ data });
    if (!parsed || parsed.name !== "send") return null;

    const order = parsed.args.order;
    return {
      orderType: order.orderType,
      srcToken: order.parameters.srcAsset,
      srcQuantity: BigInt(order.parameters.srcQuantity),
      customData: order.customData,
    };
  } catch {
    return null;
  }
}

function decodeTristeroV3CloseOrder(data?: string): boolean {
  if (!data) return false;

  try {
    const parsed = ESCROW_INTERFACE.parseTransaction({ data });
    return parsed?.name === "close";
  } catch {
    return false;
  }
}

function getMarginLoanQuantity(order: TristeroV3DecodedOrder): bigint {
  if (order.orderType.toUpperCase() !== "MARGIN" || !order.customData || order.customData === "0x") {
    return 0n;
  }

  try {
    const [loanAsset, loanQuantity] = ABI_CODER.decode(["address", "uint256", "uint256"], order.customData);
    if (normalize(loanAsset) !== normalize(order.srcToken)) return 0n;
    return BigInt(loanQuantity);
  } catch {
    return 0n;
  }
}

function getOrderVolumeQuantity(order: TristeroV3DecodedOrder): bigint {
  return order.srcQuantity + getMarginLoanQuantity(order);
}

export function isTristeroV3RouterTransferLog(log: TristeroV3TransferLog, router: string): boolean {
  const topics = log.topics ?? [];

  return topics.length === 3
    && normalize(topics[0]) === ERC20_TRANSFER_TOPIC
    && normalize(topics[2]) === topicAddress(router)
    && isNonZeroBytes32(log.data);
}

export function addTristeroV3OrdersToBalances(
  logs: TristeroV3TransferLog[],
  transactions: (TristeroV3Transaction | null)[],
  dailyVolume: Balances,
  config: TristeroV3ChainConfig,
): number {
  const seenTxs = new Set<string>();
  const transactionByHash = new Map<string, TristeroV3Transaction>();
  let matchedOrders = 0;

  transactions.forEach((tx) => {
    if (!tx?.hash) return;
    transactionByHash.set(normalize(tx.hash), tx);
  });

  logs.forEach((log) => {
    if (!isTristeroV3RouterTransferLog(log, config.router)) return;
    const txHash = getTxHash(log);
    if (!txHash) return;

    const normalizedTxHash = normalize(txHash);
    if (seenTxs.has(normalizedTxHash)) return;

    const tx = transactionByHash.get(normalizedTxHash);
    if (!isRouterTransaction(tx ?? null, config.router)) return;

    const decodedOrder = decodeTristeroV3SendOrder(tx?.data ?? tx?.input);
    if (!decodedOrder || !isIncludedOrderType(decodedOrder.orderType, config.includedOrderTypes)) return;

    seenTxs.add(normalizedTxHash);
    dailyVolume.add(decodedOrder.srcToken, getOrderVolumeQuantity(decodedOrder));
    matchedOrders += 1;
  });

  return matchedOrders;
}

function topicToAddress(topic?: string): string {
  return topic ? `0x${topic.slice(-40)}`.toLowerCase() : "";
}

function getCloseSettlementRecipients(receipt: TristeroV3Receipt, tx: TristeroV3Transaction, escrow: string): Set<string> {
  const recipients = new Set<string>();
  if (tx.from) recipients.add(normalize(tx.from));

  (receipt.logs ?? []).forEach((log) => {
    const topics = log.topics ?? [];
    if (
      normalize(log.address) === normalize(escrow)
      && topics.length === 4
      && normalize(topics[0]) === ERC20_TRANSFER_TOPIC
      && normalize(topics[2]) === ZERO_TOPIC_ADDRESS
    ) {
      recipients.add(topicToAddress(topics[1]));
    }
  });

  recipients.delete("");
  recipients.delete("0x0000000000000000000000000000000000000000");
  return recipients;
}

export function addTristeroV3CloseReceiptsToBalances(
  receipts: (TristeroV3Receipt | null)[],
  transactions: (TristeroV3Transaction | null)[],
  dailyVolume: Balances,
  config: TristeroV3ChainConfig,
): number {
  const txByHash = new Map<string, TristeroV3Transaction>();
  let matchedCloses = 0;

  transactions.forEach((tx) => {
    if (!tx?.hash) return;
    txByHash.set(normalize(tx.hash), tx);
  });

  receipts.forEach((receipt) => {
    if (!receipt) return;

    const receiptTxHash = getReceiptTxHash(receipt);
    if (!receiptTxHash) return;

    const tx = txByHash.get(normalize(receiptTxHash));
    if (!tx || !isRouterTransaction(tx, config.escrow) || !decodeTristeroV3CloseOrder(tx.data ?? tx.input)) return;

    const recipients = getCloseSettlementRecipients(receipt, tx, config.escrow);
    let addedForClose = false;

    (receipt.logs ?? []).forEach((log) => {
      const topics = log.topics ?? [];
      if (
        topics.length !== 3
        || normalize(topics[0]) !== ERC20_TRANSFER_TOPIC
        || normalize(topics[1]) !== topicAddress(config.escrow)
        || !recipients.has(topicToAddress(topics[2]))
        || !isNonZeroBytes32(log.data)
      ) {
        return;
      }

      dailyVolume.add(log.address, log.data);
      addedForClose = true;
    });

    if (addedForClose) matchedCloses += 1;
  });

  return matchedCloses;
}

export async function addTristeroV3ChainVolume(options: FetchOptions, config: TristeroV3ChainConfig): Promise<Balances> {
  const dailyVolume = options.createBalances();

  const logs: TristeroV3TransferLog[] = await options.getLogs({
    topics: [
      ERC20_TRANSFER_TOPIC,
      null as any,
      topicAddress(config.router),
    ],
    noTarget: true,
    eventAbi: "event Transfer(address indexed from, address indexed to, uint256 value)",
    entireLog: true,
  });

  const txHashes = [...new Set(logs.map(getTxHash).filter((txHash): txHash is string => !!txHash))];
  if (txHashes.length) {
    const transactions = await getTransactions(options.chain, txHashes, {
      cacheKey: "tristero-v3-router-send",
    });
    addTristeroV3OrdersToBalances(logs, transactions, dailyVolume, config);
  }

  const closeLogs: TristeroV3TransferLog[] = await options.getLogs({
    target: config.escrow,
    eventAbi: "event PositionClosed(uint128 indexed positionId, address indexed filler)",
    entireLog: true,
  });
  const closeTxHashes = [...new Set(closeLogs.map(getTxHash).filter((txHash): txHash is string => !!txHash))];
  if (closeTxHashes.length) {
    const [closeTransactions, closeReceipts] = await Promise.all([
      getTransactions(options.chain, closeTxHashes, {
        cacheKey: "tristero-v3-escrow-close",
      }),
      getTxReceipts(options.chain, closeTxHashes, {
        cacheKey: "tristero-v3-escrow-close",
      }),
    ]);
    addTristeroV3CloseReceiptsToBalances(closeReceipts as unknown as TristeroV3Receipt[], closeTransactions, dailyVolume, config);
  }

  return dailyVolume;
}
