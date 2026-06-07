import { FetchOptions } from "../adapters/types";
import { CHAIN } from "./chains";
import { getBlock } from "./getBlock";

type TristeroMarginEscrowConfig = {
  address: string;
  start: string;
  end?: string;
};

type TristeroMarginChainConfig = {
  start: string;
  escrows: TristeroMarginEscrowConfig[];
};

export type TristeroV3MarginEscrowConfig = {
  address: string;
  vault: string;
  start: string;
  end?: string;
};

type TristeroV3MarginChainConfig = {
  start: string;
  escrows: TristeroV3MarginEscrowConfig[];
};

export const TRISTERO_MARGIN_CONFIGS: Record<string, TristeroMarginChainConfig> = {
  [CHAIN.ARBITRUM]: {
    start: '2026-03-19',
    escrows: [
      // Keep the legacy Arbitrum escrow live in the adapter so older positions continue
      // to contribute TVL, open interest, and borrow-fee accrual until they are closed.
      { address: '0x270f529f16A578AAD524B94e34f579a51E00611C', start: '2026-03-19' },
      { address: '0xe400000df2f227133ff74c662c9e935439471d2e', start: '2026-04-02' },
    ],
  },
  [CHAIN.BASE]: {
    start: '2026-04-02',
    escrows: [
      { address: '0xe400000df2f227133ff74c662c9e935439471d2e', start: '2026-04-02' },
    ],
  },
  [CHAIN.ETHEREUM]: {
    start: '2026-04-02',
    escrows: [
      { address: '0xe400000df2f227133ff74c662c9e935439471d2e', start: '2026-04-02' },
    ],
  },
} as const;

export const TRISTERO_V3_MARGIN_CONFIGS: Record<string, TristeroV3MarginChainConfig> = {
  [CHAIN.ARBITRUM]: {
    start: '2026-05-21',
    escrows: [
      {
        address: '0x969D1eAb4C39706692d14894924245ca1Fe7cBCe',
        vault: '0xd329330475126E0Fd0b955C385eaf5de4B684802',
        start: '2026-05-21',
      },
    ],
  },
  [CHAIN.BASE]: {
    start: '2026-05-21',
    escrows: [
      {
        address: '0x969D1eAb4C39706692d14894924245ca1Fe7cBCe',
        vault: '0xd329330475126E0Fd0b955C385eaf5de4B684802',
        start: '2026-05-21',
      },
    ],
  },
} as const;

export function getTristeroMarginChains(): string[] {
  return Array.from(new Set([
    ...Object.keys(TRISTERO_MARGIN_CONFIGS),
    ...Object.keys(TRISTERO_V3_MARGIN_CONFIGS),
  ]));
}

export function getTristeroMarginChainStart(chain: string): string | undefined {
  const starts = [TRISTERO_MARGIN_CONFIGS[chain]?.start, TRISTERO_V3_MARGIN_CONFIGS[chain]?.start].filter(Boolean) as string[];
  return starts.sort()[0];
}

export function getActiveTristeroMarginEscrows(chain: string, date: string): string[] {
  return (TRISTERO_MARGIN_CONFIGS[chain]?.escrows ?? [])
    .filter(({ start, end }) => date >= start && (!end || date <= end))
    .map(({ address }) => address);
}

/**
 * Returns v3 margin escrows that should be included for a chain/date window.
 *
 * @param chain DefiLlama chain slug used by the adapter runner.
 * @param date Adapter date string in YYYY-MM-DD format.
 * @returns V3 margin escrow/vault configs whose start/end range includes date.
 */
export function getActiveTristeroV3MarginEscrows(chain: string, date: string): TristeroV3MarginEscrowConfig[] {
  return (TRISTERO_V3_MARGIN_CONFIGS[chain]?.escrows ?? [])
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

export type TristeroV3MarginPositionSnapshotRequest = {
  escrow: string;
  positionId: number;
  block: number;
};

export type TristeroV3MarginPositionSnapshot = TristeroV3MarginPositionSnapshotRequest & {
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

export type TristeroV3MarginReduction = {
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

/**
 * Builds the stable map key used to join v3 position event state across helpers.
 *
 * @param positionRef Escrow address and numeric v3 position id.
 * @returns Lowercase escrow and position id joined into a unique key.
 */
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

/**
 * Safely executes a margin contract read via `options.api.call`.
 *
 * `permitFailure: true` should prevent normal RPC reverts from throwing, but the
 * surrounding `try/catch` keeps the helper resilient to SDK behavior changes.
 *
 * @param options Fetch context that provides the underlying API client.
 * @param params Call parameters forwarded to `options.api.call`.
 * @returns The decoded call result, or `null` if the read still fails.
 */
export async function safeCall(options: FetchOptions, params: Record<string, any>): Promise<any | null> {
  try {
    return await (options.api.call as any)({ ...params, permitFailure: true });
  } catch {
    return null;
  }
}

export async function getPositionAtBlock(options: FetchOptions, escrow: string, positionId: number, block: number): Promise<TristeroMarginPosition | null> {
  const position = await safeCall(options, {
    target: escrow,
    abi: TRISTERO_MARGIN_ABI.positions,
    params: [positionId],
    block,
  });

  return normalizePosition(position);
}

export async function getAccumulatedInterestAtBlock(options: FetchOptions, escrow: string, positionId: number, block: number): Promise<bigint> {
  const interest = await safeCall(options, {
    target: escrow,
    abi: TRISTERO_MARGIN_ABI.accumulatedInterest,
    params: [positionId],
    block,
  });

  return toBigIntOrNull(interest) ?? 0n;
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
  const blockNumber = log?.blockNumber;

  if (positionId === null || positionId === undefined || blockNumber === null || blockNumber === undefined) return null;

  return {
    positionId: toPositionId(positionId),
    filler: normalizeAddress(args?.filler ?? args?.[1]),
    blockNumber: Number(blockNumber),
    logIndex: getLogIndex(log),
    txHash: getLogTxHash(log),
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

/**
 * Reconstructs v3 margin position snapshots at specific historical blocks.
 *
 * The returned positions preserve the loan/notional share state as of the
 * requested block, so fee adapters can value historical boundaries without
 * reusing the end-of-window mutated position state.
 *
 * @param options DefiLlama fetch options for the current chain/window.
 * @param configs Active v3 escrow/vault configs to scan.
 * @param requests Escrow, position id, and block tuples to snapshot.
 * @returns Position snapshots for requests that existed by the requested block.
 */
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

/**
 * Reconstructs v3 margin positions from PositionOpened and PositionClosed logs.
 * PositionReduced logs mutate the remaining share state; PositionClosed is terminal.
 *
 * @param options DefiLlama fetch options for the current chain/window.
 * @param configs Active v3 escrow/vault configs to scan.
 * @param toBlock Last block to include when reconstructing position state.
 * @returns V3 positions opened up to toBlock, annotated with close data when closed.
 */
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

/**
 * Reads v3 PositionReduced events and returns the loan-asset repayment amount
 * emitted by the escrow for each reduction.
 *
 * @param options DefiLlama fetch options for the current chain/window.
 * @param configs Active v3 escrow/vault configs to scan.
 * @param fromBlock First block to include.
 * @param toBlock Last block to include.
 * @returns Reduction repayment events keyed by escrow/position id.
 */
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

/**
 * Reconstructs currently open v3 margin positions and verifies each NFT owner.
 *
 * @param options DefiLlama fetch options for the current chain/window.
 * @param configs Active v3 escrow/vault configs to scan.
 * @returns V3 positions that have not emitted PositionClosed by the end block.
 */
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

  owners.forEach((owner, index) => {
    if (!normalizeAddress(owner)) {
      const position = candidates[index];
      throw new Error(`Unable to read Tristero v3 ownerOf for ${options.chain} position ${position.positionId} at ${position.escrow}`);
    }
  });

  return candidates;
}
