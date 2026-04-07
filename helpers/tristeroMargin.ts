import { FetchOptions } from "../adapters/types";
import { CHAIN } from "./chains";

type TristeroMarginEscrowConfig = {
  address: string;
  start: string;
  end?: string;
};

type TristeroMarginChainConfig = {
  start: string;
  escrows: TristeroMarginEscrowConfig[];
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

export function getTristeroMarginChains(): string[] {
  return Object.keys(TRISTERO_MARGIN_CONFIGS);
}

export function getTristeroMarginChainStart(chain: string): string | undefined {
  return TRISTERO_MARGIN_CONFIGS[chain]?.start;
}

export function getActiveTristeroMarginEscrows(chain: string, date: string): string[] {
  return (TRISTERO_MARGIN_CONFIGS[chain]?.escrows ?? [])
    .filter(({ start, end }) => date >= start && (!end || date <= end))
    .map(({ address }) => address);
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

export interface TristeroMarginPosition {
  taker: string;
  filler: string;
  token: string;
  loanToken: string;
  size: bigint;
  loanAmount: bigint;
  liqPrice: bigint;
}

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
