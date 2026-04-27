import { FetchOptions } from "../adapters/types";

export const POSITION_VAULT = "0xd8dc5d42c13b8257b97417e89c118cc46056c117";
export const LIQUIDATION_VAULT = "0x8d9db733cfbe8a0da96cb0383233665e93a4caeb";

export const toUSD = (raw: bigint) => Number(raw / 1_000_000_000_000_000_000_000_000n) / 1e6;
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
export const getUnidexV4Logs = (options: FetchOptions) => Promise.all([
  options.getLogs({
    target: POSITION_VAULT,
    eventAbi: "event IncreasePosition(uint256 indexed posId, address indexed account, uint256 indexed tokenId, bool isLong, uint256[5] posData)",
  }),
  options.getLogs({
    target: POSITION_VAULT,
    eventAbi: "event DecreasePosition(uint256 indexed posId, address indexed account, uint256 indexed tokenId, bool isLong, int256[3] pnlData, uint256[5] posData)",
  }),
  options.getLogs({
    target: POSITION_VAULT,
    eventAbi: "event ClosePosition(uint256 indexed posId, address indexed account, uint256 indexed tokenId, bool isLong, int256[3] pnlData, uint256[5] posData)",
  }),
  options.getLogs({
    target: LIQUIDATION_VAULT,
    eventAbi: "event LiquidatePosition(uint256 indexed posId, address indexed account, uint256 indexed tokenId, bool isLong, int256[3] pnlData, uint256[5] posData)",
  }),
]);
