// Release 9 deployment supplied by FAZE, September 13, 2026.
// Verified sources: https://explorer.arc.io/address/<address>?tab=contract
export const CURVE = '0x6A62919ccbf0c19e0C4e084F986b582b4492dDA4';
export const HOOK = '0x47e7936ae9891e61C5123db720593c05dE7120cc';
export const START_BLOCK = 20561244;
export const NATIVE = '0x0000000000000000000000000000000000000000';
export const FAZE = '0x394d38f807ee0027a182216f5e67a15ae441fa2e';
export const ABI = {
  "Bought": "event Bought(address indexed token, address indexed buyer, uint256 ethGross, uint256 fee, uint256 tokensOut, uint256 ethReserve, uint256 tokenReserve)",
  "FeesCollected": "event FeesCollected(address indexed token, uint256 tradeAmount, uint256 creatorAmount, uint256 treasuryAmount)",
  "Graduated": "event Graduated(address indexed token, address indexed pool, address migrator, address caller, uint256 ethMigrated, uint256 migrationFee, uint256 liquidity)",
  "LaunchFeeSet": "event LaunchFeeSet(uint256 launchFee)",
  "Launched": "event Launched(address indexed token, address indexed creator, (uint256 bondingTarget,uint16 feeBps,uint16 migrationFeeBps,address migrator,bool active,uint16 launchSellFeeBps,uint32 launchSellFeeDecay,uint16 poolFeeBps,bool compounding,uint16 launchBuyFeeBps,uint32 launchBuyFeeDecay,uint16 compoundCommitBps,bool creatorCurveFees,address quoteToken,uint32 sniperTaxWindow) terms, string name, string symbol, string tokenURI)",
  "Sold": "event Sold(address indexed token, address indexed seller, uint256 tokensIn, uint256 fee, uint256 ethOut, uint256 ethReserve, uint256 tokenReserve)",
  "getCoin": "function getCoin(address token) view returns ((address creator,address devBuyer,address migrator,address quoteToken,uint16 feeBps,uint16 migrationFeeBps,bool complete,bool graduated,bool active,bool abandoned,bool creatorCurveFees,uint16 poolFeeBps,uint16 launchSellFeeBps,uint32 launchSellFeeDecay,uint16 launchBuyFeeBps,uint32 launchBuyFeeDecay,uint16 compoundCommitBps,uint32 sniperTaxWindow,uint64 openedAt,uint64 completedAt,uint256 ethOffset,uint256 ethReserve,uint256 tokenReserve,uint256 bondingTarget,uint256 accrued) )",
  "curvePendingFees": "function pendingFees(address token) view returns (uint256 creatorAmount, uint256 treasuryAmount)",
  "Compounded": "event Compounded(bytes32 indexed poolId, int24 tickLower, int24 tickUpper, uint256 quoteAdded, uint128 liquidity)",
  "FeesSettled": "event FeesSettled(bytes32 indexed poolId, uint256 amount, uint256 creatorAmount, uint256 compoundAmount, uint256 treasuryAmount)",
  "PoolRegistered": "event PoolRegistered(bytes32 indexed poolId, address indexed asset, address indexed creator, uint16 feeBps, uint16 launchSellFeeBps, uint32 launchSellFeeDecay, uint16 launchBuyFeeBps, uint32 launchBuyFeeDecay, uint16 compoundCommitBps, address quote)",
  "hookPendingFees": "function pendingFees(bytes32 poolId) view returns (uint256 creatorAmount, uint256 compoundAmount, uint256 treasuryAmount)",
  "pools": "function pools(bytes32 poolId) view returns (address creator, uint16 feeBps, uint16 launchSellFeeBps, uint32 launchSellFeeDecay, uint16 launchBuyFeeBps, uint32 launchBuyFeeDecay, uint64 graduatedAt, uint64 graduationBlock, address asset, int24 tickSpacing, bool compounding, uint256 accrued, uint256 compoundPot)"
};
