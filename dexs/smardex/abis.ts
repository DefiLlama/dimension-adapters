export const usdnAbi = {
  vaultDepositEvent:
    "event ValidatedDeposit(address indexed to, address indexed validator, uint256 amountAfterFees, uint256 usdnMinted, uint256 timestamp)",
  vaultWithdrawalEvent:
    "event ValidatedWithdrawal(address indexed to, address indexed validator, uint256 amountWithdrawnAfterFees, uint256 usdnBurned, uint256 timestamp)",
  longOpenPositionEvent:
    "event InitiatedOpenPosition(address indexed owner, address indexed validator, uint40 timestamp, uint128 totalExpo, uint128 amount, uint128 startPrice, tuple(int24 tick, uint256 tickVersion, uint256 index) posId)",
  longClosePositionEvent:
    "event ValidatedClosePosition(address indexed validator, address indexed to, tuple(int24 tick, uint256 tickVersion, uint256 index) posId, uint256 amountReceived, int256 profit)",
  rebalancerDepositEvent:
    "event AssetsDeposited(address indexed user, uint256 amount, uint256 positionVersion)",
  rebalancerWithdrawalEvent:
    "event AssetsWithdrawn(address indexed user, address indexed to, uint256 amount)",
  liquidatedTickEvent:
    "event LiquidatedTick(int24 indexed tick, uint256 indexed oldTickVersion, uint256 liquidationPrice, uint256 effectiveTickPrice, int256 remainingCollateral)",
  liquidatorRewarded:
    "event LiquidatorRewarded (address indexed liquidator, uint256 rewards)",
};
