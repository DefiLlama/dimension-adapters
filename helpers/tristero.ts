import * as sdk from "@defillama/sdk";
import { Balances } from "@defillama/sdk";
import { AbiCoder, Interface } from "ethers";
import { FetchOptions } from "../adapters/types";
import { CHAIN } from "./chains";
import ADDRESSES from "./coreAssets.json";
import { getTransactionsWithRetry, getTxReceiptsWithRetry } from "./getTxReceipts";
import { getBlock } from "./getBlock";
import { METRIC } from "./metrics";
import { httpPost } from "../utils/fetchURL";

type TristeroV3MarginEscrowConfig = {
  address: string;
  vault: string;
  start: string;
  end?: string;
};

type TristeroV3MarginChainConfig = {
  start: string;
  escrows: TristeroV3MarginEscrowConfig[];
};

type TristeroV3RouterConfig = {
  start: string;
  end?: string;
  router: string;
};

type DecodedV3SendOrder = {
  orderType: string;
  srcToken: string;
  srcQuantity: bigint;
  customData: string;
  sender: string;
  filler: string;
  target: string;
  // Darkpool when the order never touched an external venue: a TAKER fill submitted with no
  // arb calls (router._fill settles it against the filler directly), or a MARGIN open.
  // Everything else - TAKER with arb calls, RELAY, CROSS, EXTERNAL - is aggregation flow.
  isDarkpool: boolean;
};

export type TristeroVolumeBuckets = {
  darkpool: Balances;
  aggregation: Balances;
};

const MULTICALL_FALLBACK_BATCH_SIZE = 5;

type PermitFailureMultiCallParams = {
  abi: string;
  calls: Array<{ target?: string; params?: any }>;
  target?: string;
  block?: number;
};

function formatTristeroErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function permitFailureMultiCallWithFallback(
  options: FetchOptions,
  api: any,
  params: PermitFailureMultiCallParams,
  context: string,
): Promise<any[]> {
  const block = params.block ?? api.block;
  let outputs: any[] | null = null;

  try {
    outputs = await api.multiCall({ ...params, permitFailure: true });
  } catch (error) {
    sdk.log(`Tristero multicall failed on ${options.chain} ${context}: ${formatTristeroErrorMessage(error)}`);
  }

  if (!outputs) {
    return readFallbackCalls(params.calls.map((call, index) => ({ call, index })));
  }

  const nextOutputs = [...outputs];
  const missingCalls = params.calls
    .map((call, index) => ({ call, index }))
    .filter(({ index }) => nextOutputs[index] === null || nextOutputs[index] === undefined);

  const fallbackOutputs = await readFallbackCalls(missingCalls);
  missingCalls.forEach(({ index }, fallbackIndex) => {
    if (fallbackOutputs[fallbackIndex] !== null && fallbackOutputs[fallbackIndex] !== undefined) {
      nextOutputs[index] = fallbackOutputs[fallbackIndex];
    }
  });

  return nextOutputs;

  async function readFallbackCalls(calls: Array<{ call: PermitFailureMultiCallParams["calls"][number]; index: number }>): Promise<any[]> {
    const fallbackOutputs: any[] = [];
    for (let offset = 0; offset < calls.length; offset += MULTICALL_FALLBACK_BATCH_SIZE) {
      const batch = calls.slice(offset, offset + MULTICALL_FALLBACK_BATCH_SIZE);
      fallbackOutputs.push(...await Promise.all(batch.map(({ call, index }) => readFallbackCall(call, index))));
    }

    return fallbackOutputs;
  }

  async function readFallbackCall(call: PermitFailureMultiCallParams["calls"][number], index: number): Promise<any | null> {
    const target = call.target ?? params.target;
    if (!target) {
      sdk.log(`Tristero multicall fallback missing target on ${options.chain} ${context} call ${index}`);
      return null;
    }

    try {
      const output = await api.call({
        target,
        abi: params.abi,
        params: call.params,
        block,
        permitFailure: true,
      });
      return output && typeof output === "object" && "output" in output ? output.output : output;
    } catch (error) {
      sdk.log(`Tristero multicall fallback failed on ${options.chain} ${context} call ${index} target ${target}: ${formatTristeroErrorMessage(error)}`);
      return null;
    }
  }
}

// The only margin escrow and the only vault the adapters read. Earlier escrow and vault
// generations are deliberately not referenced, so positions opened against them are not counted.
const TRISTERO_ESCROW = '0x66b53dBA061715CC52059b466eB64e3bF49F12EB';
const TRISTERO_VAULT = '0xB49781E8c39c75f413C1178f395bF68b0BEE8d00';
export const TRISTERO_START = '2026-06-18';

const TRISTERO_V3_MARGIN_CONFIGS: Record<string, TristeroV3MarginChainConfig> = {
  [CHAIN.ARBITRUM]: {
    start: TRISTERO_START,
    escrows: [{ address: TRISTERO_ESCROW, vault: TRISTERO_VAULT, start: TRISTERO_START }],
  },
  [CHAIN.BASE]: {
    start: TRISTERO_START,
    escrows: [{ address: TRISTERO_ESCROW, vault: TRISTERO_VAULT, start: TRISTERO_START }],
  },
  [CHAIN.ETHEREUM]: {
    start: TRISTERO_START,
    escrows: [{ address: TRISTERO_ESCROW, vault: TRISTERO_VAULT, start: TRISTERO_START }],
  },
} as const;

export const ERC20_TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

// The six chains where the router is deployed and taking orders. Volume starts at the router's
// 2026-06-18 rollout because no earlier contract generation is referenced any more.
export const TRISTERO_CHAINS = [CHAIN.ETHEREUM, CHAIN.ARBITRUM, CHAIN.BASE, CHAIN.POLYGON, CHAIN.AVAX, CHAIN.OPTIMISM];

const TRISTERO_ROUTER = '0x3341F2d46441118e3FB819E5b0166E25cFC4b3A1';

// The one router the adapters read. Earlier router generations are not referenced, so volume
// routed through them is not counted.
const TRISTERO_V3_ROUTER_CONFIGS: Record<string, TristeroV3RouterConfig[]> = Object.fromEntries(
  TRISTERO_CHAINS.map((chain) => [chain, [{ start: TRISTERO_START, router: TRISTERO_ROUTER }]]),
);

const V3_RECEIPT_RPC_FALLBACKS: Record<string, string[]> = {
  [CHAIN.BASE]: ["https://mainnet.base.org"],
};

// Wrapped native token per chain, for orders whose src asset is the zero address. Optimism's
// canonical WETH is the WETH_1 key in coreAssets and polygon's canonical WMATIC is WMATIC_2.
const WRAPPED_NATIVE_TOKENS: Record<string, string> = {
  [CHAIN.ETHEREUM]: ADDRESSES.ethereum.WETH,
  [CHAIN.ARBITRUM]: ADDRESSES.arbitrum.WETH,
  [CHAIN.BASE]: ADDRESSES.base.WETH,
  [CHAIN.POLYGON]: ADDRESSES.polygon.WMATIC_2,
  [CHAIN.AVAX]: ADDRESSES.avax.WAVAX,
  [CHAIN.OPTIMISM]: ADDRESSES.optimism.WETH_1,
};

const ORDER_ROUTER_INTERFACE = new Interface([
  "function send((address sender, (address srcAsset, address dstAsset, uint256 srcQuantity, uint256 dstQuantity, uint256 minQuantity, uint128 darkSalt) parameters, uint256 deadline, address target, address filler, string orderType, bytes customData) order, (uint256 nonce, bytes signature) payload, (address multicallTarget, (address target, bool allowFailure, uint256 value, bytes callData)[] calls, address refundTo, address nftRecipient) arb, uint256 minOut, (address vault, ((address token, uint256 amount) permitted, uint256 nonce, uint256 deadline) permit, bytes signature) v)"
]);
const ESCROW_INTERFACE = new Interface([
  "function close((uint128 positionId, uint256 sharesToClose, uint256 minOut, uint256 deadline, uint256 permit2Nonce) order, bytes signature, (address multicallTarget, (address target, bool allowFailure, uint256 value, bytes callData)[] calls, address refundTo, address nftRecipient) arb)"
]);
const ABI_CODER = AbiCoder.defaultAbiCoder();
const ORDER_ROUTER_SEND_SELECTOR = ORDER_ROUTER_INTERFACE.getFunction("send")?.selector.toLowerCase();

export function getTristeroMarginChains(): string[] {
  return Object.keys(TRISTERO_V3_MARGIN_CONFIGS);
}

export function getActiveTristeroV3MarginEscrows(chain: string, date: string): TristeroV3MarginEscrowConfig[] {
  return (TRISTERO_V3_MARGIN_CONFIGS[chain]?.escrows ?? [])
    .filter(({ start, end }) => date >= start && (!end || date <= end));
}

export function getActiveTristeroV3Routers(chain: string, date: string): TristeroV3RouterConfig[] {
  return (TRISTERO_V3_ROUTER_CONFIGS[chain] ?? [])
    .filter(({ start, end }) => date >= start && (!end || date <= end));
}

export const TRISTERO_MARGIN_ABI = {
  totalPositions: 'function totalPositions() view returns (uint128)',
  positions: 'function positions(uint128) view returns (address taker, address filler, address token, address loanToken, uint256 size, uint256 loanAmount, uint256 liqPrice)',
  accumulatedInterest: 'function accumulatedInterest(uint128) view returns (uint256)',
  marginPositionOpened: 'event MarginPositionOpened(bytes32 orderHash, uint128 positionId, address taker, address filler, address token, uint256 size, uint256 loanAmount, uint256 collateralSwapOutput)',
  positionClosed: 'event PositionClosed(uint128 indexed positionId, uint256 closedSize, uint256 remainingSize, uint256 loanerRepayment, uint256 takerSettlement)',
  positionLiquidated: 'event PositionLiquidated(uint128 indexed positionId, address indexed liquidator, uint256 size)',
  protocolFeeCollected: 'event ProtocolFeeCollected(uint128 indexed positionId, address indexed token, uint256 amount)',
} as const;

export const TRISTERO_V3_MARGIN_ABI = {
  ownerOf: 'function ownerOf(uint256 tokenId) view returns (address)',
  readValue: 'function readValue(address token, uint256 shares) view returns (uint256)',
  positionOpened: 'event PositionOpened(uint128 indexed positionId, address indexed taker, address indexed filler, (address underlyingAsset, address loanAsset, uint256 notionalShares, uint256 loanShares, uint256 RPS, uint256 lastUpdate) position)',
  positionReduced: 'event PositionReduced(uint128 indexed positionId, address indexed taker, uint256 repayAmount, uint256 collateralOut, (address underlyingAsset, address loanAsset, uint256 notionalShares, uint256 loanShares, uint256 RPS, uint256 lastUpdate) position)',
  positionClosed: 'event PositionClosed(uint128 indexed positionId, address indexed filler)',
} as const;

export interface TristeroMarginPosition {
  taker: string;
  filler: string;
  token: string;
  loanToken: string;
  size: bigint;
  loanAmount: bigint;
  liqPrice: bigint;
}

export interface TristeroV3MarginPosition {
  escrow: string;
  vault: string;
  positionId: number;
  taker: string;
  filler: string;
  underlyingAsset: string;
  loanAsset: string;
  notionalShares: bigint;
  loanShares: bigint;
  rps: bigint;
  lastUpdate: bigint;
  openBlock: number;
  // PositionClosed is terminal in current v3. Partial changes emit PositionReduced
  // and update the remaining share fields without setting these close fields.
  closeBlock?: number;
  closeTxHash?: string;
  closeFiller?: string;
}

type TristeroV3MarginPositionSnapshotRequest = {
  escrow: string;
  positionId: number;
  block: number;
};

type TristeroV3MarginPositionSnapshot = TristeroV3MarginPositionSnapshotRequest & {
  position: TristeroV3MarginPosition;
};

type TristeroV3PositionStruct = {
  underlyingAsset: string;
  loanAsset: string;
  notionalShares: bigint;
  loanShares: bigint;
  rps: bigint;
  lastUpdate: bigint;
};

type TristeroV3ReducedPositionLog = {
  positionId: number;
  taker: string;
  repayAmount: bigint;
  position: TristeroV3PositionStruct;
  blockNumber: number;
  logIndex: number;
  txHash?: string;
};

type TristeroV3ClosedPositionLog = {
  positionId: number;
  filler: string;
  blockNumber: number;
  logIndex: number;
  txHash?: string;
};

type TristeroV3MarginReduction = {
  escrow: string;
  positionId: number;
  repayAmount: bigint;
  blockNumber: number;
  logIndex: number;
  txHash?: string;
};

export function toBigIntSafe(value: any): bigint {
  if (value === null || value === undefined) {
    throw new Error("Expected bigint-compatible value but received nullish input");
  }
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number') return BigInt(Math.trunc(value));
  return BigInt(value.toString());
}

export function toBigIntOrNull(value: any): bigint | null {
  if (value === null || value === undefined) return null;
  return toBigIntSafe(value);
}

export function toPositionId(value: any): number {
  const positionId = toBigIntOrNull(value);
  if (positionId === null) throw new Error("Missing position id");
  return Number(positionId);
}

export function getPositionIds(totalPositions: any): number[] {
  if (totalPositions === null || totalPositions === undefined) return [];
  const total = Number(toBigIntSafe(totalPositions));
  return Array.from({ length: total }, (_, index) => index + 1);
}

export function getV3PositionKey({ escrow, positionId }: { escrow: string; positionId: number }): string {
  return `${escrow.toLowerCase()}-${positionId}`;
}

export function mulDivCeil(a: bigint, b: bigint, denominator: bigint): bigint {
  if (denominator === 0n) return 0n;
  return (a * b + denominator - 1n) / denominator;
}

export function normalizePosition(position: any): TristeroMarginPosition | null {
  if (!position) return null;

  const token = position.token ?? position[2];
  const loanToken = position.loanToken ?? position[3];
  if (!token || !loanToken) return null;

  const size = toBigIntOrNull(position.size ?? position[4]);
  const loanAmount = toBigIntOrNull(position.loanAmount ?? position[5]);
  const liqPrice = toBigIntOrNull(position.liqPrice ?? position[6]);
  if (size === null || loanAmount === null || liqPrice === null) return null;

  return {
    taker: position.taker ?? position[0],
    filler: position.filler ?? position[1],
    token,
    loanToken,
    size,
    loanAmount,
    liqPrice,
  };
}

function normalizeAddress(value?: string | null): string {
  return value?.toLowerCase() ?? "";
}

function getLogTxHash(log: any): string | undefined {
  return log?.transactionHash ?? log?.transaction_hash ?? log?.txHash;
}

function getLogIndex(log: any): number {
  const value = log?.logIndex ?? log?.log_index ?? log?.index ?? 0;
  return Number(value);
}

function normalizeV3PositionStruct(position: any): TristeroV3PositionStruct | null {
  const underlyingAsset = position.underlyingAsset ?? position[0];
  const loanAsset = position.loanAsset ?? position[1];
  const notionalShares = toBigIntOrNull(position.notionalShares ?? position[2]);
  const loanShares = toBigIntOrNull(position.loanShares ?? position[3]);
  const rps = toBigIntOrNull(position.RPS ?? position.rps ?? position[4]);
  const lastUpdate = toBigIntOrNull(position.lastUpdate ?? position[5]);

  if (!underlyingAsset || !loanAsset || notionalShares === null || loanShares === null || rps === null || lastUpdate === null) {
    return null;
  }

  return {
    underlyingAsset: normalizeAddress(underlyingAsset),
    loanAsset: normalizeAddress(loanAsset),
    notionalShares,
    loanShares,
    rps,
    lastUpdate,
  };
}

function normalizeV3PositionOpenedLog(log: any, config: TristeroV3MarginEscrowConfig): TristeroV3MarginPosition | null {
  const args = log?.args ?? log;
  const positionId = args?.positionId ?? args?.[0];
  const blockNumber = log?.blockNumber;
  const position = normalizeV3PositionStruct(args?.position ?? args?.[3]);

  if (positionId === null || positionId === undefined || !position || blockNumber === null || blockNumber === undefined) return null;

  return {
    escrow: config.address.toLowerCase(),
    vault: config.vault.toLowerCase(),
    positionId: toPositionId(positionId),
    taker: normalizeAddress(args?.taker ?? args?.[1]),
    filler: normalizeAddress(args?.filler ?? args?.[2]),
    ...position,
    openBlock: Number(blockNumber),
  };
}

function normalizeV3PositionReducedLog(log: any): TristeroV3ReducedPositionLog | null {
  const args = log?.args ?? log;
  const positionId = args?.positionId ?? args?.[0];
  const repayAmount = toBigIntOrNull(args?.repayAmount ?? args?.[2]);
  const blockNumber = log?.blockNumber;
  const position = normalizeV3PositionStruct(args?.position ?? args?.[4]);

  if (positionId === null || positionId === undefined || repayAmount === null || !position || blockNumber === null || blockNumber === undefined) return null;

  return {
    positionId: toPositionId(positionId),
    taker: normalizeAddress(args?.taker ?? args?.[1]),
    repayAmount,
    position,
    blockNumber: Number(blockNumber),
    logIndex: getLogIndex(log),
    txHash: getLogTxHash(log),
  };
}

function normalizeV3PositionClosedLog(log: any): TristeroV3ClosedPositionLog | null {
  const args = log?.args ?? log;
  const positionId = args?.positionId ?? args?.[0];
  const filler = normalizeAddress(args?.filler ?? args?.[1]);
  const blockNumber = log?.blockNumber;
  const txHash = getLogTxHash(log);

  if (positionId === null || positionId === undefined || !filler || !txHash || blockNumber === null || blockNumber === undefined) return null;

  return {
    positionId: toPositionId(positionId),
    filler,
    blockNumber: Number(blockNumber),
    logIndex: getLogIndex(log),
    txHash,
  };
}

function cloneV3MarginPosition(position: TristeroV3MarginPosition): TristeroV3MarginPosition {
  return { ...position };
}

function stringifyV3LogContext(log: any): string {
  try {
    return JSON.stringify(log, (_key, value) => typeof value === 'bigint' ? value.toString() : value).slice(0, 1000);
  } catch {
    return '[unserializable log]';
  }
}

function malformedV3LogError(eventName: string, config: TristeroV3MarginEscrowConfig, log: any): Error {
  return new Error(
    `Unable to normalize Tristero v3 ${eventName} log for ${config.address.toLowerCase()} at block ${String(log?.blockNumber)} logIndex ${String(getLogIndex(log))}: ${stringifyV3LogContext(log)}`
  );
}

function requireV3PositionOpenedLog(log: any, config: TristeroV3MarginEscrowConfig): TristeroV3MarginPosition {
  const position = normalizeV3PositionOpenedLog(log, config);
  if (!position) throw malformedV3LogError('PositionOpened', config, log);
  return position;
}

function requireV3PositionReducedLog(log: any, config: TristeroV3MarginEscrowConfig): TristeroV3ReducedPositionLog {
  const reducedLog = normalizeV3PositionReducedLog(log);
  if (!reducedLog) throw malformedV3LogError('PositionReduced', config, log);
  return reducedLog;
}

function requireV3PositionClosedLog(log: any, config: TristeroV3MarginEscrowConfig): TristeroV3ClosedPositionLog {
  const closedLog = normalizeV3PositionClosedLog(log);
  if (!closedLog) throw malformedV3LogError('PositionClosed', config, log);
  return closedLog;
}

async function getV3EscrowStartBlock(chain: string, start: string): Promise<number> {
  const timestamp = Math.floor(new Date(`${start}T00:00:00Z`).getTime() / 1000);
  const block = await getBlock(timestamp, chain);
  if (block === null || block === undefined) {
    throw new Error(`Unable to resolve Tristero v3 margin escrow start block for ${chain} at ${start}`);
  }

  return Number(block);
}

export async function getTristeroV3MarginPositionSnapshots(
  options: FetchOptions,
  configs: TristeroV3MarginEscrowConfig[],
  requests: TristeroV3MarginPositionSnapshotRequest[],
): Promise<TristeroV3MarginPositionSnapshot[]> {
  const snapshots: TristeroV3MarginPositionSnapshot[] = [];
  if (!requests.length) return snapshots;

  for (const config of configs) {
    const configRequests = requests
      .filter((request) => request.escrow.toLowerCase() === config.address.toLowerCase())
      .map((request) => ({ ...request, escrow: request.escrow.toLowerCase() }))
      .sort((a, b) => a.block - b.block);
    if (!configRequests.length) continue;

    const maxBlock = Math.max(...configRequests.map((request) => request.block));
    const startBlock = await getV3EscrowStartBlock(options.chain, config.start);
    if (startBlock > maxBlock) continue;

    const [openedLogs, reducedLogs, closedLogs] = await Promise.all([
      options.getLogs({
        target: config.address,
        eventAbi: TRISTERO_V3_MARGIN_ABI.positionOpened,
        fromBlock: startBlock,
        toBlock: maxBlock,
        entireLog: true,
        parseLog: true,
        cacheInCloud: true,
      }),
      options.getLogs({
        target: config.address,
        eventAbi: TRISTERO_V3_MARGIN_ABI.positionReduced,
        fromBlock: startBlock,
        toBlock: maxBlock,
        entireLog: true,
        parseLog: true,
        cacheInCloud: true,
      }),
      options.getLogs({
        target: config.address,
        eventAbi: TRISTERO_V3_MARGIN_ABI.positionClosed,
        fromBlock: startBlock,
        toBlock: maxBlock,
        entireLog: true,
        parseLog: true,
        cacheInCloud: true,
      }),
    ]);

    const positionEvents = [
      ...(openedLogs as any[]).flatMap((log) => {
        const position = requireV3PositionOpenedLog(log, config);
        return [{ type: 'opened' as const, blockNumber: position.openBlock, logIndex: getLogIndex(log), position }];
      }),
      ...(reducedLogs as any[]).flatMap((log) => {
        const reducedLog = requireV3PositionReducedLog(log, config);
        return [{ type: 'reduced' as const, ...reducedLog }];
      }),
      ...(closedLogs as any[]).flatMap((log) => {
        const closedLog = requireV3PositionClosedLog(log, config);
        return [{ type: 'closed' as const, ...closedLog }];
      }),
    ].sort((a, b) => a.blockNumber - b.blockNumber || a.logIndex - b.logIndex);

    const positionsByKey = new Map<string, TristeroV3MarginPosition>();
    let eventIndex = 0;

    configRequests.forEach((request) => {
      while (eventIndex < positionEvents.length && positionEvents[eventIndex].blockNumber <= request.block) {
        const event = positionEvents[eventIndex];

        if (event.type === 'opened') {
          positionsByKey.set(getV3PositionKey(event.position), cloneV3MarginPosition(event.position));
          eventIndex += 1;
          continue;
        }

        const key = getV3PositionKey({ escrow: config.address, positionId: event.positionId });
        const position = positionsByKey.get(key);
        if (position) {
          if (event.type === 'reduced') {
            position.taker = event.taker;
            position.underlyingAsset = event.position.underlyingAsset;
            position.loanAsset = event.position.loanAsset;
            position.notionalShares = event.position.notionalShares;
            position.loanShares = event.position.loanShares;
            position.rps = event.position.rps;
            position.lastUpdate = event.position.lastUpdate;
          } else {
            position.closeBlock = event.blockNumber;
            position.closeTxHash = event.txHash;
            position.closeFiller = event.filler;
          }
        }

        eventIndex += 1;
      }

      const snapshot = positionsByKey.get(getV3PositionKey(request));
      if (snapshot && (snapshot.closeBlock === undefined || snapshot.closeBlock > request.block)) {
        snapshots.push({
          ...request,
          position: cloneV3MarginPosition(snapshot),
        });
      }
    });
  }

  return snapshots;
}

export async function getTristeroV3MarginPositions(
  options: FetchOptions,
  configs: TristeroV3MarginEscrowConfig[],
  toBlock: number,
): Promise<TristeroV3MarginPosition[]> {
  const positionsByKey = new Map<string, TristeroV3MarginPosition>();

  for (const config of configs) {
    const startBlock = await getV3EscrowStartBlock(options.chain, config.start);
    if (startBlock > toBlock) continue;

    const [openedLogs, reducedLogs, closedLogs] = await Promise.all([
      options.getLogs({
        target: config.address,
        eventAbi: TRISTERO_V3_MARGIN_ABI.positionOpened,
        fromBlock: startBlock,
        toBlock,
        entireLog: true,
        parseLog: true,
        cacheInCloud: true,
      }),
      options.getLogs({
        target: config.address,
        eventAbi: TRISTERO_V3_MARGIN_ABI.positionReduced,
        fromBlock: startBlock,
        toBlock,
        entireLog: true,
        parseLog: true,
        cacheInCloud: true,
      }),
      options.getLogs({
        target: config.address,
        eventAbi: TRISTERO_V3_MARGIN_ABI.positionClosed,
        fromBlock: startBlock,
        toBlock,
        entireLog: true,
        parseLog: true,
        cacheInCloud: true,
      }),
    ]);

    (openedLogs as any[]).forEach((log) => {
      const position = requireV3PositionOpenedLog(log, config);
      positionsByKey.set(getV3PositionKey(position), position);
    });

    const positionStateLogs = [
      ...(reducedLogs as any[]).flatMap((log) => {
        const reducedLog = requireV3PositionReducedLog(log, config);
        return [{ type: 'reduced' as const, ...reducedLog }];
      }),
      ...(closedLogs as any[]).flatMap((log) => {
        const closedLog = requireV3PositionClosedLog(log, config);
        return [{ type: 'closed' as const, ...closedLog }];
      }),
    ].sort((a, b) => a.blockNumber - b.blockNumber || a.logIndex - b.logIndex);

    positionStateLogs.forEach((log) => {
      const key = getV3PositionKey({ escrow: config.address, positionId: log.positionId });
      const position = positionsByKey.get(key);
      if (!position) return;

      if (log.type === 'reduced') {
        position.taker = log.taker;
        position.underlyingAsset = log.position.underlyingAsset;
        position.loanAsset = log.position.loanAsset;
        position.notionalShares = log.position.notionalShares;
        position.loanShares = log.position.loanShares;
        position.rps = log.position.rps;
        position.lastUpdate = log.position.lastUpdate;
        return;
      }

      position.closeBlock = log.blockNumber;
      position.closeTxHash = log.txHash;
      position.closeFiller = log.filler;
    });
  }

  return Array.from(positionsByKey.values());
}

export async function getTristeroV3MarginReductions(
  options: FetchOptions,
  configs: TristeroV3MarginEscrowConfig[],
  fromBlock: number,
  toBlock: number,
): Promise<TristeroV3MarginReduction[]> {
  const reductions: TristeroV3MarginReduction[] = [];
  if (!configs.length || fromBlock > toBlock) return reductions;

  for (const config of configs) {
    const startBlock = await getV3EscrowStartBlock(options.chain, config.start);
    const queryFromBlock = Math.max(startBlock, fromBlock);
    if (queryFromBlock > toBlock) continue;

    const reducedLogs = await options.getLogs({
      target: config.address,
      eventAbi: TRISTERO_V3_MARGIN_ABI.positionReduced,
      fromBlock: queryFromBlock,
      toBlock,
      entireLog: true,
      parseLog: true,
      cacheInCloud: true,
    });

    (reducedLogs as any[]).forEach((log) => {
      const reducedLog = requireV3PositionReducedLog(log, config);
      reductions.push({
        escrow: config.address.toLowerCase(),
        positionId: reducedLog.positionId,
        repayAmount: reducedLog.repayAmount,
        blockNumber: reducedLog.blockNumber,
        logIndex: reducedLog.logIndex,
        txHash: reducedLog.txHash,
      });
    });
  }

  return reductions;
}

export async function getOpenTristeroV3MarginPositions(
  options: FetchOptions,
  configs: TristeroV3MarginEscrowConfig[],
): Promise<TristeroV3MarginPosition[]> {
  if (!configs.length) return [];

  const toBlock = await options.getToBlock();
  const positions = await getTristeroV3MarginPositions(options, configs, toBlock);
  const candidates = positions.filter((position) => position.closeBlock === undefined || position.closeBlock > toBlock);
  if (!candidates.length) return [];

  const owners = await options.toApi.multiCall({
    abi: TRISTERO_V3_MARGIN_ABI.ownerOf,
    calls: candidates.map((position) => ({
      target: position.escrow,
      params: [position.positionId],
    })),
    permitFailure: true,
  });

  // Burned v3 position NFTs revert on ownerOf; after log replay they are not open.
  return candidates.filter((_position, index) => normalizeAddress(owners[index]));
}

function topicAddress(address: string): string {
  return `0x${address.toLowerCase().replace(/^0x/, "").padStart(64, "0")}`;
}

function topicToAddress(topic?: string): string {
  return topic ? `0x${topic.slice(-40)}`.toLowerCase() : "";
}

function isNonZeroBytes32(value?: string): boolean {
  if (!value || !/^0x[0-9a-fA-F]{64}$/.test(value)) return false;
  return BigInt(value) > 0n;
}

function getReceiptTxHash(receipt: { hash?: string; transactionHash?: string; logs?: any[] }): string | undefined {
  return receipt.transactionHash ?? receipt.hash ?? getLogTxHash(receipt.logs?.[0]);
}

function sumEscrowToFillerTransfers(
  logs: readonly { address?: string; topics?: readonly string[]; data?: string }[],
  loanAsset: string,
  escrow: string,
  filler: string,
): bigint {
  const escrowTopic = topicAddress(escrow);
  let total = 0n;

  logs.forEach((log) => {
    const topics = log.topics ?? [];
    if (
      normalizeAddress(log.address) !== normalizeAddress(loanAsset)
      || topics.length !== 3
      || normalizeAddress(topics[0]) !== ERC20_TRANSFER_TOPIC
      || normalizeAddress(topics[1]) !== escrowTopic
      || topicToAddress(topics[2]) !== normalizeAddress(filler)
      || !log.data
      || !isNonZeroBytes32(log.data)
    ) {
      return;
    }

    total += BigInt(log.data);
  });

  return total;
}

async function getV3CloseReceipt(chain: string, txHash: string): Promise<any | null> {
  for (const rpcUrl of V3_RECEIPT_RPC_FALLBACKS[chain] ?? []) {
    try {
      const payload = await httpPost(rpcUrl, {
        jsonrpc: "2.0",
        id: 1,
        method: "eth_getTransactionReceipt",
        params: [txHash],
      });
      if (payload?.result) return payload.result;
    } catch (error) {
      sdk.log(`Tristero v3 fallback RPC ${rpcUrl} failed for ${txHash}: ${(error as Error).message}`);
    }
  }

  return null;
}

export async function getV3CloseSettlements(
  options: FetchOptions,
  closedPositions: TristeroV3MarginPosition[],
  _cacheKey: string,
): Promise<Map<string, bigint>> {
  const settlementByPosition = new Map<string, bigint>();
  const txHashes = [...new Set(closedPositions.map((position) => position.closeTxHash).filter((txHash): txHash is string => !!txHash))];
  if (!txHashes.length) return settlementByPosition;

  const receipts = await getTxReceiptsWithRetry(options.chain, txHashes);
  const positionsByTxHash = new Map<string, TristeroV3MarginPosition[]>();

  closedPositions.forEach((position) => {
    if (!position.closeTxHash) return;
    const txHash = normalizeAddress(position.closeTxHash);
    const positions = positionsByTxHash.get(txHash) ?? [];
    positions.push(position);
    positionsByTxHash.set(txHash, positions);
  });

  for (const [index, cachedReceipt] of receipts.entries()) {
    const requestedTxHash = normalizeAddress(txHashes[index]);
    const receipt = cachedReceipt ?? await getV3CloseReceipt(options.chain, requestedTxHash);
    if (!receipt) {
      const affectedPositions = (positionsByTxHash.get(requestedTxHash) ?? [])
        .map(getV3PositionKey)
        .join(", ") || "none";
      throw new Error(`Missing Tristero v3 close receipt for ${options.chain} tx ${requestedTxHash}; affected positions: ${affectedPositions}`);
    }

    const txHash = normalizeAddress(getReceiptTxHash(receipt) ?? requestedTxHash);
    const positions = positionsByTxHash.get(txHash);
    if (!positions?.length) continue;
    if (positions.length !== 1) {
      throw new Error(`Ambiguous Tristero v3 close settlement for ${options.chain} tx ${txHash}: ${positions.length} positions share one receipt`);
    }

    const position = positions[0];
    const closeFiller = normalizeAddress(position.closeFiller);
    if (!closeFiller) {
      throw new Error(`Missing Tristero v3 close filler for ${options.chain} position ${position.positionId} at ${position.escrow} tx ${txHash}`);
    }

    settlementByPosition.set(
      getV3PositionKey(position),
      sumEscrowToFillerTransfers(receipt.logs ?? [], position.loanAsset, position.escrow, closeFiller),
    );
  }

  return settlementByPosition;
}

function normalizeVolumeToken(chain: string, tokenAddress?: string | null): string | null {
  const normalized = tokenAddress?.toLowerCase();
  if (!normalized) return null;

  if (normalized === '0x0000000000000000000000000000000000000000' || normalized === 'native') {
    const wrappedToken = WRAPPED_NATIVE_TOKENS[chain];
    if (!wrappedToken) throw new Error(`Missing wrapped native token mapping for ${chain}`);
    return wrappedToken.toLowerCase();
  }

  return normalized;
}

function decodeV3SendOrder(data?: string): DecodedV3SendOrder | null {
  if (!data || !ORDER_ROUTER_SEND_SELECTOR || !data.toLowerCase().startsWith(ORDER_ROUTER_SEND_SELECTOR)) return null;

  try {
    const parsed = ORDER_ROUTER_INTERFACE.parseTransaction({ data });
    if (!parsed || parsed.name !== "send") return null;

    const order = parsed.args.order;
    const orderType = String(order.orderType).toUpperCase();
    const isInternalMatch = orderType === "TAKER" && parsed.args.arb.calls.length === 0;
    return {
      orderType: order.orderType,
      srcToken: order.parameters.srcAsset,
      srcQuantity: BigInt(order.parameters.srcQuantity),
      customData: order.customData,
      sender: normalizeAddress(order.sender),
      filler: normalizeAddress(order.filler),
      target: normalizeAddress(order.target),
      isDarkpool: orderType === "MARGIN" || isInternalMatch,
    };
  } catch (error) {
    const calldataContext = `${data.slice(0, 74)}${data.length > 74 ? "..." : ""}`;
    sdk.log(`Unable to decode Tristero v3 router.send calldata ${calldataContext}: ${(error as Error).message}`);
    throw error;
  }
}

function decodeV3CloseOrder(data?: string): boolean {
  if (!data) return false;

  try {
    const parsed = ESCROW_INTERFACE.parseTransaction({ data });
    return parsed?.name === "close";
  } catch (error) {
    const calldataContext = `${data.slice(0, 74)}${data.length > 74 ? "..." : ""}`;
    sdk.log(`Unable to decode Tristero v3 escrow.close calldata ${calldataContext}: ${(error as Error).message}`);
    throw error;
  }
}

function decodeMarginLoan(order: { orderType: string; customData: string }) {
  if (order.orderType.toUpperCase() !== "MARGIN" || !order.customData || order.customData === "0x") return null;

  try {
    const [loanAsset, loanQuantity] = ABI_CODER.decode(["address", "uint256", "uint256"], order.customData);
    return { token: String(loanAsset), quantity: BigInt(loanQuantity) };
  } catch (error) {
    throw new Error(`Unable to decode Tristero v3 MARGIN customData: ${(error as Error).message}`);
  }
}

// A darkpool fill where the order's sender is also its filler is circular: the same account
// posts the dst leg, receives the src leg back, and is swept the output. Nothing changes hands
// with a third party, so it is not volume. Aggregated fills are exempt - a user routing their
// own tokens through an external venue is a real swap even when they submit it themselves.
function isSelfFilledDarkpoolOrder(order: { isDarkpool: boolean; sender: string; filler: string }): boolean {
  return order.isDarkpool && !!order.sender && order.sender === order.filler;
}

function addDecodedV3SendOrderVolume(
  options: FetchOptions,
  buckets: TristeroVolumeBuckets,
  decodedOrder: DecodedV3SendOrder,
  txHash: string,
) {
  if (isSelfFilledDarkpoolOrder(decodedOrder)) return;

  const dailyVolume = decodedOrder.isDarkpool ? buckets.darkpool : buckets.aggregation;

  // Source-side amount only. The maker's dst leg is the same trade settling on the other side,
  // not a second trade - counting it too would double the fill (a $100 fill books $100, not $200).
  const srcTokenAddress = normalizeVolumeToken(options.chain, decodedOrder.srcToken);
  if (srcTokenAddress) dailyVolume.add(srcTokenAddress, decodedOrder.srcQuantity);

  const marginLoan = decodeMarginLoan(decodedOrder);
  if (marginLoan?.quantity) {
    const loanToken = normalizeVolumeToken(options.chain, marginLoan.token);
    if (!loanToken) throw new Error(`Unsupported Tristero v3 loan token in tx ${txHash}`);
    dailyVolume.add(loanToken, marginLoan.quantity);
  }
}

function groupClosePositionsByTxHash(positions: TristeroV3MarginPosition[], closeTxHashes: Set<string>) {
  const positionsByTxHash = new Map<string, TristeroV3MarginPosition[]>();

  positions.forEach((position) => {
    const txHash = normalizeAddress(position.closeTxHash);
    if (!txHash || !closeTxHashes.has(txHash)) return;

    const positionsForTx = positionsByTxHash.get(txHash) ?? [];
    positionsForTx.push(position);
    positionsByTxHash.set(txHash, positionsForTx);
  });

  return positionsByTxHash;
}

// Margin closes settle against the filler inside the escrow, so they belong to the darkpool
// bucket alongside the MARGIN opens they unwind.
async function addV3MarginCloseVolume(options: FetchOptions, buckets: TristeroVolumeBuckets) {
  const dailyVolume = buckets.darkpool;
  const activeV3Escrows = getActiveTristeroV3MarginEscrows(options.chain, options.dateString);
  if (!activeV3Escrows.length) return;

  const escrowAddresses = activeV3Escrows.map(({ address }) => address);
  const closeLogs = await options.getLogs({ targets: escrowAddresses, eventAbi: TRISTERO_V3_MARGIN_ABI.positionClosed, entireLog: true });

  const closeTxHashes = [...new Set(closeLogs.map(getLogTxHash).filter((txHash): txHash is string => !!txHash))];
  if (!closeTxHashes.length) return;

  const closePositionsByTxHash = groupClosePositionsByTxHash(
    await getTristeroV3MarginPositions(options, activeV3Escrows, await options.getToBlock()),
    new Set(closeTxHashes.map(normalizeAddress)),
  );

  const [closeTransactions, closeReceipts] = await Promise.all([
    getTransactionsWithRetry(options.chain, closeTxHashes),
    getTxReceiptsWithRetry(options.chain, closeTxHashes),
  ]);

  const txByHash = new Map(closeTransactions.filter((tx) => tx?.hash).map((tx) => [normalizeAddress(tx!.hash!), tx]));

  closeTxHashes.forEach((txHash, index) => {
    const receipt = closeReceipts[index];
    if (!receipt) throw new Error(`Missing Tristero close receipt for tx ${normalizeAddress(txHash)}`);

    const receiptTxHash = normalizeAddress(getReceiptTxHash(receipt as any) ?? txHash);
    const closePositions = closePositionsByTxHash.get(receiptTxHash);
    if (!closePositions?.length) throw new Error(`Missing Tristero close position state for tx ${receiptTxHash}`);
    if (closePositions.length !== 1) {
      throw new Error(`Ambiguous Tristero close volume for tx ${receiptTxHash}: ${closePositions.length} positions share one receipt`);
    }

    const closePosition = closePositions[0];
    const escrow = normalizeAddress(closePosition.escrow);
    const tx = txByHash.get(receiptTxHash) as any;
    if (!tx || normalizeAddress(tx.to) !== escrow || !decodeV3CloseOrder(tx.data ?? tx.input)) {
      throw new Error(`Missing Tristero close transaction data for ${escrow} tx ${receiptTxHash}`);
    }

    const closeFiller = normalizeAddress(closePosition.closeFiller);
    if (!closeFiller) throw new Error(`Missing Tristero close filler for ${escrow} tx ${receiptTxHash}`);

    const amount = sumEscrowToFillerTransfers((receipt.logs ?? []) as any, closePosition.loanAsset, escrow, closeFiller);
    if (amount > 0n) dailyVolume.add(normalizeAddress(closePosition.loanAsset), amount);
  });
}

function toTransferTopic(address: string): string {
  return `0x${address.slice(2).toLowerCase().padStart(64, "0")}`;
}

type TristeroFillTransaction = { hash: string; input: string; from: string; to: string };

// dexs, aggregators and fees each ask for the same fills over the same window, so the log scan
// and the transaction fetch behind it are memoised per chain and block range.
const fillTransactionCache = new Map<string, Promise<TristeroFillTransaction[]>>();

// Every Tristero fill pulls the taker's source leg into the router, which is an ERC20 Transfer
// with `to` = the router. That makes fills discoverable with a plain topic-filtered getLogs - no
// transaction scan, so no indexer - even though the router itself emits nothing. The
// transactions behind those logs are then fetched once and decoded, which preserves the order
// type, the darkpool flag and the margin loan leg.
function getTristeroFillTransactions(
  options: FetchOptions,
  addresses: string[],
): Promise<TristeroFillTransaction[]> {
  // Callers pass router addresses in mixed case, so they are normalised once here. That also
  // makes the cache key stable, so the volume and fee adapters share one discovery per window.
  const routers = [...new Set(addresses.map(normalizeAddress))].sort();
  if (!routers.length) return Promise.resolve([]);

  const cacheKey = `${options.chain}-${options.fromTimestamp}-${options.toTimestamp}-${routers.join(",")}`;
  const cached = fillTransactionCache.get(cacheKey);
  if (cached) return cached;

  // Only successful discoveries stay cached. Retaining a rejected promise would make every
  // later request for the same chain and window fail instantly for the lifetime of the worker,
  // defeating the retry that a transient provider failure needs.
  const pending = fetchTristeroFillTransactions(options, routers).catch((error) => {
    fillTransactionCache.delete(cacheKey);
    throw error;
  });
  fillTransactionCache.set(cacheKey, pending);
  return pending;
}

async function fetchTristeroFillTransactions(
  options: FetchOptions,
  routers: string[],
): Promise<TristeroFillTransaction[]> {
  const logsPerAddress = await Promise.all(routers.map((address) => options.getLogs({
    noTarget: true,
    // Match on the recipient only. The sdk accepts a positional null to skip topic1; the
    // wrapper type declares string[], hence the cast.
    topics: [ERC20_TRANSFER_TOPIC, null, toTransferTopic(address)] as unknown as string[],
    entireLog: true,
  })));

  const txHashes = [...new Set(
    logsPerAddress.flat()
      .map((log: any) => getLogTxHash(log))
      .filter((txHash): txHash is string => !!txHash)
      .map(normalizeAddress),
  )];
  if (!txHashes.length) return [];

  const transactions = await getTransactionsWithRetry(options.chain, txHashes);

  // An unresolved transaction is missing input, not an empty one. Dropping it would silently
  // lose the volume and gas abstraction it carried.
  const missingIndex = transactions.findIndex((tx) => !tx);
  if (missingIndex >= 0) {
    throw new Error(`Unable to load Tristero fill transaction on ${options.chain}: ${txHashes[missingIndex]}`);
  }

  // A transfer into the router only proves tokens moved, not that the router was the callee -
  // an unrelated contract could be called with calldata that happens to share the selector. Only
  // transactions sent to a configured router are decoded.
  return transactions
    .map((tx: any, index: number) => ({
      hash: tx?.hash ? normalizeAddress(tx.hash) : txHashes[index],
      from: normalizeAddress(tx?.from),
      to: normalizeAddress(tx?.to),
      input: String(tx?.data ?? tx?.input ?? ""),
    }))
    .filter(({ to, input }) => routers.includes(to) && input.length > 2);
}

async function addV3RouterOpenVolume(options: FetchOptions, buckets: TristeroVolumeBuckets) {

  const activeV3Routers = getActiveTristeroV3Routers(options.chain, options.dateString);
  if (!activeV3Routers.length || !ORDER_ROUTER_SEND_SELECTOR) return;

  const txRows = await getTristeroFillTransactions(options, activeV3Routers.map(({ router }) => router));

  for (const row of txRows) {
    // take() and any other router entry point simply will not match the send selector.
    const decodedOrder = decodeV3SendOrder(row.input);
    if (!decodedOrder) continue;

    addDecodedV3SendOrderVolume(options, buckets, decodedOrder, row.hash);
  }
}

export async function fetchTristeroVolumeBuckets(options: FetchOptions): Promise<TristeroVolumeBuckets> {
  const buckets: TristeroVolumeBuckets = {
    darkpool: options.createBalances(),
    aggregation: options.createBalances(),
  };

  await Promise.all([
    addV3RouterOpenVolume(options, buckets),
    addV3MarginCloseVolume(options, buckets),
  ]);

  return buckets;
}

// Gas abstraction: what the filler is paid for submitting an order on the taker's behalf. On
// aggregated fills the arb executor pays it out of the swap proceeds straight to the submitting
// account, in the dst asset, sometimes split across several transfers; on RELAY the router
// itself skims `srcQuantity - minAmountUsdc`. Either way it lands on the submitter, so summing
// transfers to that account recovers it - with one exclusion: on a darkpool fill the router
// hands the filler the whole src leg as settlement, which is not a fee.
export async function fetchTristeroGasAbstractionFees(options: FetchOptions): Promise<Balances> {
  const dailyFees = options.createBalances();

  const addresses = getActiveTristeroV3Routers(options.chain, options.dateString)
    .map(({ router }) => normalizeAddress(router));
  if (!addresses.length) return dailyFees;

  const txs = await getTristeroFillTransactions(options, addresses);
  const feeBearing = txs
    .map((tx) => ({ ...tx, orders: [decodeV3SendOrder(tx.input)].filter((order): order is DecodedV3SendOrder => !!order) }))
    // A self-filled order pays no gas abstraction by definition: the submitter is the taker.
    // If the submitter is also the order's payout target, the proceeds land on them too and
    // cannot be told apart from a fee - skip rather than overstate.
    .filter(({ orders, from }) => orders.some((order) =>
      order.filler !== order.sender && order.filler === from && order.target !== from));
  if (!feeBearing.length) return dailyFees;

  const receipts = await getTxReceiptsWithRetry(options.chain, feeBearing.map(({ hash }) => hash));

  feeBearing.forEach(({ hash, from, orders }, index) => {
    const receipt = receipts[index];
    // Missing input data, not an empty day: skipping would under-report fees silently.
    if (!receipt) throw new Error(`Missing Tristero gas abstraction receipt for ${options.chain} tx ${hash}`);

    const darkpoolSrcTokens = new Set(orders.filter(({ isDarkpool }) => isDarkpool).map(({ srcToken }) => normalizeAddress(srcToken)));

    (receipt.logs ?? []).forEach((log: any) => {
      if (normalizeAddress(log.topics?.[0]) !== ERC20_TRANSFER_TOPIC || log.topics.length !== 3) return;
      if (topicToAddress(log.topics[2]) !== from) return;

      const token = normalizeAddress(log.address);
      // Darkpool settlement leg, not a charge.
      if (addresses.includes(topicToAddress(log.topics[1])) && darkpoolSrcTokens.has(token)) return;

      const amount = toBigIntOrNull(log.data);
      if (amount && amount > 0n) dailyFees.add(token, amount, METRIC.TRANSACTION_GAS_FEES);
    });
  });

  return dailyFees;
}

// Total capital sitting in the Tristero vault on this chain - idle plus lent out. getTVOL is
// the vault's own accounting of both.
export const TRISTERO_VAULT_ASSETS: Record<string, string> = {
  [CHAIN.ETHEREUM]: ADDRESSES.mantle.AUSD,
  [CHAIN.ARBITRUM]: ADDRESSES.arbitrum.USDC_CIRCLE,
  [CHAIN.BASE]: ADDRESSES.base.USDC,
};

export function getTristeroVaultAddress(): string {
  return TRISTERO_VAULT;
}

export async function getTristeroVaultTotal(options: FetchOptions): Promise<{ token: string; amount: bigint } | null> {
  const token = TRISTERO_VAULT_ASSETS[options.chain];
  if (!token) return null;

  // No permitFailure: a reverted or unreachable vault call is missing input, not a zero
  // balance, and swallowing it would publish a complete-looking day with the entire protocol
  // revenue component missing.
  const total = await options.api.call({
    target: TRISTERO_VAULT,
    abi: 'function getTVOL(address _token) view returns (uint256)',
    params: [token],
  });

  return { token, amount: toBigIntSafe(total) };
}
