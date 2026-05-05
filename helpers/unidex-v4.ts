import { log } from "@defillama/sdk";
import { FetchOptions } from "../adapters/types";
import { PromisePool } from "@supercharge/promise-pool";

export const POSITION_VAULT = "0xd8dc5d42c13b8257b97417e89c118cc46056c117";
export const LIQUIDATION_VAULT = "0x8d9db733cfbe8a0da96cb0383233665e93a4caeb";

export const toUSD = (raw: bigint) => Number(raw / 10n ** 24n) / 1e6;
export const abs = (n: bigint) => (n < 0n ? -n : n);

// posData: uint256[5]
//   [0] collateralDelta
//   [1] sizeDelta
//   [2] averagePrice
//   [3] price (mark/closing price)
//   [4] fee (open/close fee only)
//   note: liquidation fee is not emitted here — computed as abs(collateralDelta) / 10
//
// pnlData: int256[3]
//   [0] pnl
//   [1] fundingFee
//   [2] borrowFee

export interface PosData {
  collateralDelta: bigint;
  sizeDelta: bigint;
  averagePrice: bigint;
  price: bigint;
  fee: bigint;
}

export interface PnlData {
  pnl: bigint;
  fundingFee: bigint;
  borrowFee: bigint;
}

export interface PositionLog {
  posId: bigint; account: string; tokenId: bigint; isLong: boolean;
  posData: PosData;
}

export interface PositionWithPnlLog {
  posId: bigint; account: string; tokenId: bigint; isLong: boolean;
  pnlData: PnlData;
  posData: PosData;
}

const LOG_CONFIGS = [
  { target: POSITION_VAULT, eventAbi: "event IncreasePosition(uint256 indexed posId, address indexed account, uint256 indexed tokenId, bool isLong, uint256[5] posData)" },
  { target: POSITION_VAULT, eventAbi: "event DecreasePosition(uint256 indexed posId, address indexed account, uint256 indexed tokenId, bool isLong, int256[3] pnlData, uint256[5] posData)" },
  { target: POSITION_VAULT, eventAbi: "event ClosePosition(uint256 indexed posId, address indexed account, uint256 indexed tokenId, bool isLong, int256[3] pnlData, uint256[5] posData)" },
  { target: LIQUIDATION_VAULT, eventAbi: "event LiquidatePosition(uint256 indexed posId, address indexed account, uint256 indexed tokenId, bool isLong, int256[3] pnlData, uint256[5] posData)" },
];

const mapPosData = (posData: bigint[]): PosData => ({
  collateralDelta: posData?.[0] ?? 0n,
  sizeDelta: posData?.[1] ?? 0n,
  averagePrice: posData?.[2] ?? 0n,
  price: posData?.[3] ?? 0n,
  fee: posData?.[4] ?? 0n,
});

const mapPnlData = (pnlData: bigint[]): PnlData => ({
  pnl: pnlData?.[0] ?? 0n,
  fundingFee: pnlData?.[1] ?? 0n,
  borrowFee: pnlData?.[2] ?? 0n,
});

export const getUnidexV4Logs = async (options: FetchOptions) => {
  const { results, errors } = await PromisePool
    .withConcurrency(2)
    .for(LOG_CONFIGS)
    .process(cfg => options.getLogs(cfg));

  if (errors.length) {
    log(`Errors: ${errors.length} while fetching Unidex V4 logs...`);
    throw errors;
  };

  const [rawIncrease, rawDecrease, rawClose, rawLiquidate] = results;

  const increase: PositionLog[] = rawIncrease.map((e: any) => ({
    ...e, posData: mapPosData(e.posData),
  }));

  const withPnl = (raw: any[]): PositionWithPnlLog[] => raw.map((e: any) => ({
    ...e, pnlData: mapPnlData(e.pnlData), posData: mapPosData(e.posData),
  }));

  return [increase, withPnl(rawDecrease), withPnl(rawClose), withPnl(rawLiquidate)] as
    [PositionLog[], PositionWithPnlLog[], PositionWithPnlLog[], PositionWithPnlLog[]];
};
