import { Balances } from "@defillama/sdk";
import { AbiCoder, Interface } from "ethers";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import ADDRESSES from "../../helpers/coreAssets.json";
import getTxReceipts, { getTransactions } from "../../helpers/getTxReceipts";
import {
  getActiveTristeroV3MarginEscrows,
  getTristeroV3MarginPositions,
  type TristeroV3MarginPosition,
} from "../../helpers/tristeroMargin";

const event_order_filled = 'event OrderFilled(bytes32 indexed orderUUID,string orderType,address target,address filler,address srcAsset,address dstAsset,uint256 srcQuantity,uint256 dstQuantity)';
const ERC20_TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

type RouterConfig = {
  address: string;
  start: string;
  end?: string;
};

// v2_order_router contract addresses (same across all chains, updated over time)
const ROUTER_SCHEDULE: RouterConfig[] = [
  { address: '0x98888e2e040944cee3d7c8da22368aef18f5a3f4', start: '2025-12-01', end: '2026-01-14' }, // Router v1
  { address: '0x90000069af5a354cf1dC438dEFbF8e0469d87F02', start: '2026-01-15', end: '2026-01-31' }, // Router v2
  { address: '0x900000D231B9C5c2374415f0974C1F8a377757E9', start: '2026-02-01', end: '2026-02-28' }, // Router v3
  { address: '0x4b000001c0be947f4238620f57cbd07421007f43', start: '2026-03-01', end: '2026-04-01' }, // Router v4
  { address: '0x4d00000075eFB197178E05aeFF759c5c20d3F32d', start: '2026-04-02', end: '2026-04-14' }, // Router v5
  { address: '0x4e00000193B7Ba7F9e6EB8019373d27e9F0Af80c', start: '2026-04-15' }, // Router v6
];

const chainConfig = {
  [CHAIN.ABSTRACT]: { start: "2025-08-18" },
  [CHAIN.APECHAIN]: { start: "2025-08-18" },
  [CHAIN.BERACHAIN]: { start: "2025-08-18" },
  [CHAIN.BOB]: { start: "2025-08-18" },
  [CHAIN.ETHEREUM]: { start: "2025-08-30" },
  [CHAIN.ARBITRUM]: { start: "2025-08-18" },
  [CHAIN.XDAI]: { start: "2025-08-18" },
  [CHAIN.INK]: { start: "2025-11-27" },
  [CHAIN.MANTLE]: { start: "2025-08-18" },
  [CHAIN.MODE]: { start: "2025-08-18" },
  [CHAIN.MONAD]: { start: "2025-11-24" },
  [CHAIN.OPTIMISM]: { start: "2025-08-18" },
  [CHAIN.BASE]: { start: "2025-08-18" },
  [CHAIN.POLYGON]: { start: "2025-08-30" },
  [CHAIN.RONIN]: { start: "2025-08-18" },
  [CHAIN.SCROLL]: { start: "2025-08-18" },
  [CHAIN.SONIC]: { start: "2025-08-18" },
  [CHAIN.AVAX]: { start: "2025-08-18" },
  [CHAIN.LINEA]: { start: "2025-09-20" },
  [CHAIN.UNICHAIN]: { start: "2025-11-27" },
}

const WRAPPED_NATIVE_TOKENS: Record<string, string | undefined> = {
  [CHAIN.APECHAIN]: ADDRESSES[CHAIN.APECHAIN]?.WAPE,
  [CHAIN.AVAX]: ADDRESSES[CHAIN.AVAX]?.WAVAX,
  [CHAIN.BERACHAIN]: ADDRESSES[CHAIN.BERACHAIN]?.WBERA,
  [CHAIN.MANTLE]: ADDRESSES[CHAIN.MANTLE]?.WMNT,
  [CHAIN.MONAD]: ADDRESSES[CHAIN.MONAD]?.WMON,
  [CHAIN.RONIN]: ADDRESSES[CHAIN.RONIN]?.WRON,
  [CHAIN.SONIC]: ADDRESSES[CHAIN.SONIC]?.wS,
  [CHAIN.XDAI]: ADDRESSES[CHAIN.XDAI]?.WXDAI,
};

function normalizeVolumeToken(chain: string, tokenAddress?: string | null): string | null {
  const normalized = tokenAddress?.toLowerCase();
  if (!normalized) return null;

  if (normalized === '0x0000000000000000000000000000000000000000' || normalized === 'native') {
    const wrappedToken = WRAPPED_NATIVE_TOKENS[chain] ?? ADDRESSES[chain]?.WETH;
    return wrappedToken?.toLowerCase() ?? null;
  }

  return normalized;
}

type TristeroV3ChainConfig = {
  start: string;
  router: string;
  escrow: string;
  includedOrderTypes: string[];
};

type TristeroV3TransferLog = {
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

const TRISTERO_V3_VOLUME_CONFIGS: Record<string, TristeroV3ChainConfig> = {
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

const ORDER_ROUTER_INTERFACE = new Interface(ORDER_ROUTER_ABI);
const ESCROW_INTERFACE = new Interface(ESCROW_ABI);
const ABI_CODER = AbiCoder.defaultAbiCoder();

function topicAddress(address: string): string {
  return `0x${address.toLowerCase().replace(/^0x/, "").padStart(64, "0")}`;
}

function normalize(value?: string | null): string {
  return value?.toLowerCase() ?? "";
}

function getTxHash(log?: TristeroV3TransferLog | null): string | undefined {
  return log?.transactionHash ?? log?.transaction_hash ?? log?.txHash;
}

function getReceiptTxHash(receipt: TristeroV3Receipt): string | undefined {
  return receipt.transactionHash ?? receipt.hash ?? (receipt.logs?.length ? getTxHash(receipt.logs[0] as TristeroV3TransferLog) : undefined);
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

function decodeTristeroV3SendOrder(data?: string): TristeroV3DecodedOrder | null {
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
  } catch (error) {
    throw new Error(`Unable to decode Tristero v3 MARGIN customData: ${(error as Error).message}`);
  }
}

function getOrderVolumeQuantity(order: TristeroV3DecodedOrder): bigint {
  return order.srcQuantity + getMarginLoanQuantity(order);
}

function isTristeroV3RouterTransferLog(log: TristeroV3TransferLog, router: string): boolean {
  const topics = log.topics ?? [];

  return topics.length === 3
    && normalize(topics[0]) === ERC20_TRANSFER_TOPIC
    && normalize(topics[2]) === topicAddress(router)
    && isNonZeroBytes32(log.data);
}

function addTristeroV3OrdersToBalances(
  logs: TristeroV3TransferLog[],
  transactions: (TristeroV3Transaction | null)[],
  dailyVolume: Balances,
  config: TristeroV3ChainConfig,
  chain: string,
) {
  const seenTxs = new Set<string>();
  const transactionByHash = new Map<string, TristeroV3Transaction>();

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

    const tokenAddress = normalizeVolumeToken(chain, decodedOrder.srcToken);
    if (!tokenAddress) return;

    seenTxs.add(normalizedTxHash);
    dailyVolume.add(tokenAddress, getOrderVolumeQuantity(decodedOrder));
  });
}

function topicToAddress(topic?: string): string {
  return topic ? `0x${topic.slice(-40)}`.toLowerCase() : "";
}

function addTristeroV3CloseReceiptsToBalances(
  receipts: (TristeroV3Receipt | null)[],
  transactions: (TristeroV3Transaction | null)[],
  dailyVolume: Balances,
  config: TristeroV3ChainConfig,
  closePositionsByTxHash: Map<string, TristeroV3MarginPosition[]>,
  closeTxHashes: string[],
) {
  const txByHash = new Map<string, TristeroV3Transaction>();

  transactions.forEach((tx) => {
    if (!tx?.hash) return;
    txByHash.set(normalize(tx.hash), tx);
  });

  receipts.forEach((receipt, index) => {
    if (!receipt) {
      throw new Error(`Missing Tristero v3 close receipt for ${config.escrow} tx ${normalize(closeTxHashes[index])}`);
    }

    const receiptTxHash = getReceiptTxHash(receipt);
    if (!receiptTxHash) {
      throw new Error(`Missing Tristero v3 close receipt transaction hash for ${config.escrow} tx ${normalize(closeTxHashes[index])}`);
    }
    const normalizedReceiptTxHash = normalize(receiptTxHash);

    const tx = txByHash.get(normalizedReceiptTxHash);
    if (!tx || !isRouterTransaction(tx, config.escrow) || !decodeTristeroV3CloseOrder(tx.data ?? tx.input)) {
      throw new Error(`Missing Tristero v3 close transaction data for ${config.escrow} tx ${normalizedReceiptTxHash}`);
    }

    const closePositions = closePositionsByTxHash.get(normalizedReceiptTxHash);
    if (!closePositions?.length) {
      throw new Error(`Missing Tristero v3 close position state for ${config.escrow} tx ${normalizedReceiptTxHash}`);
    }
    if (closePositions.length !== 1) {
      throw new Error(`Ambiguous Tristero v3 close volume attribution for ${config.escrow} tx ${normalizedReceiptTxHash}: ${closePositions.length} positions share one receipt`);
    }

    const closePosition = closePositions[0];
    const loanAsset = normalize(closePosition.loanAsset);
    const closeFiller = normalize(closePosition.closeFiller);
    if (!closeFiller) {
      throw new Error(`Missing Tristero v3 close filler for ${config.escrow} tx ${normalizedReceiptTxHash}`);
    }

    let grossCloseAmount = 0n;

    (receipt.logs ?? []).forEach((log) => {
      const topics = log.topics ?? [];
      if (
        normalize(log.address) !== loanAsset
        || topics.length !== 3
        || normalize(topics[0]) !== ERC20_TRANSFER_TOPIC
        || normalize(topics[1]) !== topicAddress(config.escrow)
        || topicToAddress(topics[2]) !== closeFiller
        || !isNonZeroBytes32(log.data)
      ) {
        return;
      }

      grossCloseAmount += BigInt(log.data);
    });

    if (grossCloseAmount > 0n) {
      dailyVolume.add(loanAsset, grossCloseAmount);
    }
  });
}

function groupClosePositionsByTxHash(positions: TristeroV3MarginPosition[], closeTxHashes: Set<string>): Map<string, TristeroV3MarginPosition[]> {
  const positionsByTxHash = new Map<string, TristeroV3MarginPosition[]>();

  positions.forEach((position) => {
    const txHash = normalize(position.closeTxHash);
    if (!txHash || !closeTxHashes.has(txHash)) return;

    const positionsForTx = positionsByTxHash.get(txHash) ?? [];
    positionsForTx.push(position);
    positionsByTxHash.set(txHash, positionsForTx);
  });

  return positionsByTxHash;
}

async function addTristeroV3ChainVolume(options: FetchOptions, dailyVolume: Balances) {
  const config = TRISTERO_V3_VOLUME_CONFIGS[options.chain];
  if (!config || options.dateString < config.start) return;

  // Current v3 router.send is nonpayable and backend submits it with value=0,
  // so router funding is discoverable through ERC20 Transfer logs. If a future
  // router.send becomes payable, also decode tx.value-backed native funding.
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
    addTristeroV3OrdersToBalances(logs, transactions, dailyVolume, config, options.chain);
  }

  const closeLogs: TristeroV3TransferLog[] = await options.getLogs({
    target: config.escrow,
    eventAbi: "event PositionClosed(uint128 indexed positionId, address indexed filler)",
    entireLog: true,
  });
  const closeTxHashes = [...new Set(closeLogs.map(getTxHash).filter((txHash): txHash is string => !!txHash))];
  if (closeTxHashes.length) {
    const normalizedCloseTxHashes = new Set(closeTxHashes.map(normalize));
    const v3MarginPositions = await getTristeroV3MarginPositions(
      options,
      getActiveTristeroV3MarginEscrows(options.chain, options.dateString),
      await options.getToBlock(),
    );
    const closePositionsByTxHash = groupClosePositionsByTxHash(v3MarginPositions, normalizedCloseTxHashes);

    const [closeTransactions, closeReceipts] = await Promise.all([
      getTransactions(options.chain, closeTxHashes, {
        cacheKey: "tristero-v3-escrow-close",
      }),
      getTxReceipts(options.chain, closeTxHashes, {
        cacheKey: "tristero-v3-escrow-close",
      }),
    ]);
    addTristeroV3CloseReceiptsToBalances(closeReceipts as unknown as TristeroV3Receipt[], closeTransactions, dailyVolume, config, closePositionsByTxHash, closeTxHashes);
  }
}

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const chain = options.chain;
  const date = new Date(options.startOfDay * 1000).toISOString().slice(0, 10);
  const activeRouters = ROUTER_SCHEDULE
    .filter(({ start, end }) => date >= start && (!end || date <= end))
    .map(({ address }) => address);

  // Query OrderFilled events from the router contract version active for the indexed day.
  const logsPerRouter = await Promise.all(
    activeRouters.map((router) =>
      options.getLogs({
        target: router,
        eventAbi: event_order_filled,
        onlyArgs: true,
      })
    )
  );
  const allLogs = logsPerRouter.flat();

  allLogs.forEach((log: any) => {
    if (log.srcAsset && log.srcQuantity) {
      const tokenAddress = normalizeVolumeToken(chain, log.srcAsset);
      if (!tokenAddress) return;
      dailyVolume.add(tokenAddress, log.srcQuantity);
    }
  });

  await addTristeroV3ChainVolume(options, dailyVolume);

  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  adapter: Object.fromEntries(
    Object.entries(chainConfig).map(([chain, config]) => [
      chain,
      { fetch, start: config.start }
    ])
  ),
  methodology: {
    Volume: "Legacy Tristero volume is counted from OrderFilled source token amounts. V3 volume is counted from on-chain router.send transactions for TAKER, CROSS, and MARGIN orders plus escrow.close settlement transfers; margin opens include collateral plus decoded loan quantity.",
  },
};

export default adapter;
