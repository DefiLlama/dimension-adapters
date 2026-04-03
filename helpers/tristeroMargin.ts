import { FetchOptions } from "../adapters/types";
import { CHAIN } from "./chains";

export const TRISTERO_MARGIN_CONFIG = {
  chain: CHAIN.ARBITRUM,
  start: '2026-03-19',
  escrow: '0x270f529f16A578AAD524B94e34f579a51E00611C',
  router: '0x40BB0e664f376DDD0E34F35Baef9eF744eB5cA57',
} as const;

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
  if (value === null || value === undefined) return 0n;
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number') return BigInt(Math.trunc(value));
  return BigInt(value.toString());
}

export function toPositionId(value: any): number {
  return Number(toBigIntSafe(value));
}

export function getPositionIds(totalPositions: any): number[] {
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

  return {
    taker: position.taker ?? position[0],
    filler: position.filler ?? position[1],
    token,
    loanToken,
    size: toBigIntSafe(position.size ?? position[4]),
    loanAmount: toBigIntSafe(position.loanAmount ?? position[5]),
    liqPrice: toBigIntSafe(position.liqPrice ?? position[6]),
  };
}

export async function safeCall(options: FetchOptions, params: Record<string, any>) {
  try {
    return await options.api.call({ ...params, permitFailure: true });
  } catch {
    return null;
  }
}

export async function getPositionAtBlock(options: FetchOptions, positionId: number, block: number): Promise<TristeroMarginPosition | null> {
  const position = await safeCall(options, {
    target: TRISTERO_MARGIN_CONFIG.escrow,
    abi: TRISTERO_MARGIN_ABI.positions,
    params: [positionId],
    block,
  });

  return normalizePosition(position);
}

export async function getAccumulatedInterestAtBlock(options: FetchOptions, positionId: number, block: number): Promise<bigint> {
  const interest = await safeCall(options, {
    target: TRISTERO_MARGIN_CONFIG.escrow,
    abi: TRISTERO_MARGIN_ABI.accumulatedInterest,
    params: [positionId],
    block,
  });

  return toBigIntSafe(interest);
}
