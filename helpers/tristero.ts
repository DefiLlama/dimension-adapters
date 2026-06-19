import * as sdk from "@defillama/sdk";
import { Balances } from "@defillama/sdk";
import { AbiCoder, Interface } from "ethers";
import { Row } from "@clickhouse/client";
import { FetchOptions } from "../adapters/types";
import { CHAIN } from "./chains";
import ADDRESSES from "./coreAssets.json";
import getTxReceipts, { getTransactions } from "./getTxReceipts";
import { getBlock } from "./getBlock";
import { queryClickhouse } from "./indexer";
import { httpPost } from "../utils/fetchURL";

type TristeroMarginEscrowConfig = {
  address: string;
  start: string;
  end?: string;
};

type TristeroMarginChainConfig = {
  start: string;
  escrows: TristeroMarginEscrowConfig[];
};

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

const TRISTERO_MARGIN_CONFIGS: Record<string, TristeroMarginChainConfig> = {
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

// V3 margin contracts follow Tristero backend addresses.yml rollouts
// (d10f35b9 / 161a80b0; internal) and production contract updates. Older
// escrows stay active so still-open positions continue to be counted.
const TRISTERO_V3_MARGIN_CONFIGS: Record<string, TristeroV3MarginChainConfig> = {
  [CHAIN.ARBITRUM]: {
    start: '2026-05-21',
    escrows: [
      {
        address: '0x969D1eAb4C39706692d14894924245ca1Fe7cBCe',
        vault: '0xd329330475126E0Fd0b955C385eaf5de4B684802',
        start: '2026-05-21',
      },
      {
        address: '0x2D728047A6012752C77Ae3067c963127e13213cB',
        vault: '0xB49781E8c39c75f413C1178f395bF68b0BEE8d00',
        start: '2026-06-09',
      },
      {
        address: '0x25E1c35721F8826B29401ed628D120037891312c',
        vault: '0xB49781E8c39c75f413C1178f395bF68b0BEE8d00',
        start: '2026-06-14',
      },
      // 2026-06-18 prod rollout; escrow/vault deployed on Arbitrum:
      // https://arbitrum.blockscout.com/address/0x66b53dBA061715CC52059b466eB64e3bF49F12EB
      // https://arbitrum.blockscout.com/address/0xB49781E8c39c75f413C1178f395bF68b0BEE8d00
      {
        address: '0x66b53dBA061715CC52059b466eB64e3bF49F12EB',
        vault: '0xB49781E8c39c75f413C1178f395bF68b0BEE8d00',
        start: '2026-06-18',
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
      {
        address: '0x2D728047A6012752C77Ae3067c963127e13213cB',
        vault: '0xB49781E8c39c75f413C1178f395bF68b0BEE8d00',
        start: '2026-06-09',
      },
      {
        address: '0x25E1c35721F8826B29401ed628D120037891312c',
        vault: '0xB49781E8c39c75f413C1178f395bF68b0BEE8d00',
        start: '2026-06-15',
      },
      // 2026-06-18 prod rollout; escrow/vault deployed on Base:
      // https://base.blockscout.com/address/0x66b53dBA061715CC52059b466eB64e3bF49F12EB
      // https://base.blockscout.com/address/0xB49781E8c39c75f413C1178f395bF68b0BEE8d00
      {
        address: '0x66b53dBA061715CC52059b466eB64e3bF49F12EB',
        vault: '0xB49781E8c39c75f413C1178f395bF68b0BEE8d00',
        start: '2026-06-18',
      },
    ],
  },
  [CHAIN.ETHEREUM]: {
    start: '2026-06-09',
    escrows: [
      {
        address: '0x2D728047A6012752C77Ae3067c963127e13213cB',
        vault: '0xB49781E8c39c75f413C1178f395bF68b0BEE8d00',
        start: '2026-06-09',
      },
      {
        address: '0x25E1c35721F8826B29401ed628D120037891312c',
        vault: '0xB49781E8c39c75f413C1178f395bF68b0BEE8d00',
        start: '2026-06-15',
      },
      // 2026-06-18 prod rollout; escrow/vault deployed on Ethereum:
      // https://eth.blockscout.com/address/0x66b53dBA061715CC52059b466eB64e3bF49F12EB
      // https://eth.blockscout.com/address/0xB49781E8c39c75f413C1178f395bF68b0BEE8d00
      {
        address: '0x66b53dBA061715CC52059b466eB64e3bF49F12EB',
        vault: '0xB49781E8c39c75f413C1178f395bF68b0BEE8d00',
        start: '2026-06-18',
      },
    ],
  },
} as const;

export const ORDER_FILLED_EVENT = 'event OrderFilled(bytes32 indexed orderUUID,string orderType,address target,address filler,address srcAsset,address dstAsset,uint256 srcQuantity,uint256 dstQuantity)';
export const ERC20_TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

export const TRISTERO_ROUTER_SCHEDULE = [
  { address: '0x98888e2e040944cee3d7c8da22368aef18f5a3f4', start: '2025-12-01', end: '2026-01-14' },
  { address: '0x90000069af5a354cf1dC438dEFbF8e0469d87F02', start: '2026-01-15', end: '2026-01-31' },
  { address: '0x900000D231B9C5c2374415f0974C1F8a377757E9', start: '2026-02-01', end: '2026-02-28' },
  { address: '0x4b000001c0be947f4238620f57cbd07421007f43', start: '2026-03-01', end: '2026-04-01' },
  { address: '0x4d00000075eFB197178E05aeFF759c5c20d3F32d', start: '2026-04-02', end: '2026-04-14' },
  { address: '0x4e00000193B7Ba7F9e6EB8019373d27e9F0Af80c', start: '2026-04-15' },
] as const;

export const TRISTERO_DEX_CHAINS: Record<string, { start: string }> = {
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
};

// V3 source-side volume is indexed from router.send() calls. The schedule mirrors
// Tristero backend addresses.yml generations and production contract updates;
// day overlaps reflect public explorer cutovers and are safe because each tx has one router.
const TRISTERO_V3_ROUTER_CONFIGS: Record<string, TristeroV3RouterConfig[]> = {
  [CHAIN.ARBITRUM]: [
    { start: "2026-05-21", end: "2026-06-09", router: "0x739DfF607F5303a2EB4D2271d11AEC6f642f6480" },
    { start: "2026-06-09", end: "2026-06-15", router: "0xb998aE9B130a04ac1c56f6877daFE8666aDc38b0" },
    { start: "2026-06-14", end: "2026-06-18", router: "0x93DeA893cef33bE999133efa3Dd3f514211F56ba" },
    // 2026-06-18 prod router; send() activity verified on Arbitrum:
    // https://arbitrum.blockscout.com/address/0x3341F2d46441118e3FB819E5b0166E25cFC4b3A1
    { start: "2026-06-18", router: "0x3341F2d46441118e3FB819E5b0166E25cFC4b3A1" },
  ],
  [CHAIN.BASE]: [
    { start: "2026-05-21", end: "2026-06-08", router: "0x739DfF607F5303a2EB4D2271d11AEC6f642f6480" },
    { start: "2026-06-09", end: "2026-06-14", router: "0xb998aE9B130a04ac1c56f6877daFE8666aDc38b0" },
    { start: "2026-06-15", end: "2026-06-18", router: "0x93DeA893cef33bE999133efa3Dd3f514211F56ba" },
    // 2026-06-18 prod router; send() activity verified on Base:
    // https://base.blockscout.com/address/0x3341F2d46441118e3FB819E5b0166E25cFC4b3A1
    { start: "2026-06-18", router: "0x3341F2d46441118e3FB819E5b0166E25cFC4b3A1" },
  ],
  [CHAIN.ETHEREUM]: [
    { start: "2026-06-09", end: "2026-06-14", router: "0xb998aE9B130a04ac1c56f6877daFE8666aDc38b0" },
    { start: "2026-06-15", end: "2026-06-18", router: "0x93DeA893cef33bE999133efa3Dd3f514211F56ba" },
    // 2026-06-18 prod router; send() activity verified on Ethereum:
    // https://eth.blockscout.com/address/0x3341F2d46441118e3FB819E5b0166E25cFC4b3A1
    { start: "2026-06-18", router: "0x3341F2d46441118e3FB819E5b0166E25cFC4b3A1" },
  ],
};

const V3_RECEIPT_RPC_FALLBACKS: Record<string, string[]> = {
  base: ["https://mainnet.base.org"],
};

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

const ORDER_ROUTER_INTERFACE = new Interface([
  "function send((address sender, (address srcAsset, address dstAsset, uint256 srcQuantity, uint256 dstQuantity, uint256 minQuantity, uint128 darkSalt) parameters, uint256 deadline, address target, address filler, string orderType, bytes customData) order, (uint256 nonce, bytes signature) payload, (address multicallTarget, (address target, bool allowFailure, uint256 value, bytes callData)[] calls, address refundTo, address nftRecipient) arb, uint256 minOut, (address vault, ((address token, uint256 amount) permitted, uint256 nonce, uint256 deadline) permit, bytes signature) v)"
]);
const ESCROW_INTERFACE = new Interface([
  "function close((uint128 positionId, uint256 sharesToClose, uint256 minOut, uint256 deadline, uint256 permit2Nonce) order, bytes signature, (address multicallTarget, (address target, bool allowFailure, uint256 value, bytes callData)[] calls, address refundTo, address nftRecipient) arb)"
]);
const ABI_CODER = AbiCoder.defaultAbiCoder();
const ORDER_ROUTER_SEND_SELECTOR = ORDER_ROUTER_INTERFACE.getFunction("send")?.selector.toLowerCase();

export function getActiveRouters(date: string): string[] {
  return TRISTERO_ROUTER_SCHEDULE
    .filter((router) => date >= router.start && (!("end" in router) || !router.end || date <= router.end))
    .map(({ address }) => address);
}

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
  cacheKey: string,
): Promise<Map<string, bigint>> {
  const settlementByPosition = new Map<string, bigint>();
  const txHashes = [...new Set(closedPositions.map((position) => position.closeTxHash).filter((txHash): txHash is string => !!txHash))];
  if (!txHashes.length) return settlementByPosition;

  const receipts = await getTxReceipts(options.chain, txHashes, { cacheKey });
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
    const wrappedToken = WRAPPED_NATIVE_TOKENS[chain] ?? (ADDRESSES as Record<string, { WETH?: string } | undefined>)[chain]?.WETH;
    return wrappedToken?.toLowerCase() ?? null;
  }

  return normalized;
}

function decodeV3SendOrder(data?: string) {
  if (!data || !ORDER_ROUTER_SEND_SELECTOR || !data.toLowerCase().startsWith(ORDER_ROUTER_SEND_SELECTOR)) return null;

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

async function addV3MarginCloseVolume(options: FetchOptions, dailyVolume: Balances) {
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
    getTransactions(options.chain, closeTxHashes, { cacheKey: "tristero-v3-escrow-close" }),
    getTxReceipts(options.chain, closeTxHashes, { cacheKey: "tristero-v3-escrow-close" }),
  ]);

  const txByHash = new Map(closeTransactions.filter((tx) => tx?.hash).map((tx) => [normalizeAddress(tx!.hash!), tx]));

  closeTxHashes.forEach((txHash, index) => {
    const receipt = closeReceipts[index];
    if (!receipt) throw new Error(`Missing Tristero v3 close receipt for tx ${normalizeAddress(txHash)}`);

    const receiptTxHash = normalizeAddress(getReceiptTxHash(receipt as any) ?? txHash);
    const closePositions = closePositionsByTxHash.get(receiptTxHash);
    if (!closePositions?.length) throw new Error(`Missing Tristero v3 close position state for tx ${receiptTxHash}`);
    if (closePositions.length !== 1) {
      throw new Error(`Ambiguous Tristero v3 close volume for tx ${receiptTxHash}: ${closePositions.length} positions share one receipt`);
    }

    const closePosition = closePositions[0];
    const escrow = normalizeAddress(closePosition.escrow);
    const tx = txByHash.get(receiptTxHash) as any;
    if (!tx || normalizeAddress(tx.to) !== escrow || !decodeV3CloseOrder(tx.data ?? tx.input)) {
      throw new Error(`Missing Tristero v3 close transaction data for ${escrow} tx ${receiptTxHash}`);
    }

    const closeFiller = normalizeAddress(closePosition.closeFiller);
    if (!closeFiller) throw new Error(`Missing Tristero v3 close filler for ${escrow} tx ${receiptTxHash}`);

    const amount = sumEscrowToFillerTransfers((receipt.logs ?? []) as any, closePosition.loanAsset, escrow, closeFiller);
    if (amount > 0n) dailyVolume.add(normalizeAddress(closePosition.loanAsset), amount);
  });
}

async function addV3RouterOpenVolume(options: FetchOptions, dailyVolume: Balances) {
  const activeV3Routers = getActiveTristeroV3Routers(options.chain, options.dateString);
  if (!activeV3Routers.length || !ORDER_ROUTER_SEND_SELECTOR) return;

  const txRows = (
    await Promise.all(activeV3Routers.map(({ router }) => queryClickhouse<Row & { hash: string; input: string }>(`
      SELECT hash, input
      FROM evm_indexer.transactions
      WHERE chain = {chain:UInt64}
        AND to_address = {router:String}
        AND startsWith(input, {selector:String})
        AND status = 'success'
        AND timestamp >= toDateTime({fromTs:UInt32})
        AND timestamp < toDateTime({toTs:UInt32})
    `, {
      chain: Number(options.api.chainId),
      router: router.toLowerCase(),
      selector: ORDER_ROUTER_SEND_SELECTOR,
      fromTs: options.fromTimestamp,
      toTs: options.toTimestamp,
    })))
  ).flat();

  for (const row of txRows) {
    const decodedOrder = decodeV3SendOrder(String(row.input));
    if (!decodedOrder) continue;

    const tokenAddress = normalizeVolumeToken(options.chain, decodedOrder.srcToken);
    if (!tokenAddress) continue;

    dailyVolume.add(tokenAddress, decodedOrder.srcQuantity);

    const marginLoan = decodeMarginLoan(decodedOrder);
    if (marginLoan?.quantity) {
      const loanToken = normalizeVolumeToken(options.chain, marginLoan.token);
      if (!loanToken) throw new Error(`Unsupported Tristero v3 loan token in tx ${row.hash}`);
      dailyVolume.add(loanToken, marginLoan.quantity);
    }
  }
}

export async function fetchDailyVolume(options: FetchOptions): Promise<Balances> {
  const dailyVolume = options.createBalances();
  const activeRouters = getActiveRouters(options.dateString);

  if (activeRouters.length) {
    const logsPerRouter = await Promise.all(
      activeRouters.map((router) => options.getLogs({ target: router, eventAbi: ORDER_FILLED_EVENT, onlyArgs: true })),
    );

    logsPerRouter.flat().forEach((log: any) => {
      if (!log.srcAsset || !log.srcQuantity) return;
      const tokenAddress = normalizeVolumeToken(options.chain, log.srcAsset);
      if (!tokenAddress) return;
      dailyVolume.add(tokenAddress, log.srcQuantity);
    });
  }

  await Promise.all([
    addV3RouterOpenVolume(options, dailyVolume),
    addV3MarginCloseVolume(options, dailyVolume),
  ]);

  return dailyVolume;
}
