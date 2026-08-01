export default {
  getReserves: 'address[]:getReserves',
  getReservesList: 'address[]:getReservesList',
  getConfiguration: 'function getConfiguration(address) view returns (tuple(uint256 data))',
  FLASHLOAN_PREMIUM_TOTAL: 'uint256:FLASHLOAN_PREMIUM_TOTAL',
  FLASHLOAN_PREMIUM_TO_PROTOCOL: 'uint256:FLASHLOAN_PREMIUM_TO_PROTOCOL',
  getReserveConfiguration: "function getReserveConfigurationData(address asset) view returns (uint256 decimals, uint256 ltv, uint256 liquidationThreshold, uint256 liquidationBonus, uint256 reserveFactor, bool usageAsCollateralEnabled, bool borrowingEnabled, bool stableBorrowRateEnabled, bool isActive, bool isFrozen)",
  getReserveDataV1: "function getReserveData(address asset) view returns (uint256 totalLiquidity, uint256 availableLiquidity, uint256 totalBorrowsStable, uint256 totalBorrowsVariable, uint256 liquidityRate, uint256 variableBorrowRate, uint256 stableBorrowRate, uint256 averageStableBorrowRate, uint256 utilizationRate, uint256 liquidityIndex, uint256 variableBorrowIndex, address aTokenAddress, uint40 lastUpdateTimestamp)",
  getReserveDataV2: "function getReserveData(address asset) view returns (uint256 availableLiquidity, uint256 totalStableDebt, uint256 totalVariableDebt, uint256 liquidityRate, uint256 variableBorrowRate, uint256 stableBorrowRate, uint256 averageStableBorrowRate, uint256 liquidityIndex, uint256 variableBorrowIndex, uint40 lastUpdateTimestamp)",
  getReserveDataV3: "function getReserveData(address asset) view returns (uint256 unbacked, uint256 accruedToTreasuryScaled, uint256 totalAToken, uint256 totalStableDebt, uint256 totalVariableDebt, uint256 liquidityRate, uint256 variableBorrowRate, uint256 stableBorrowRate, uint256 averageStableBorrowRate, uint256 liquidityIndex, uint256 variableBorrowIndex, uint40 lastUpdateTimestamp)",
  FlashloanEvent: 'event FlashLoan(address indexed target, address initiator, address indexed asset, uint256 amount, uint8 interestRateMode, uint256 premium, uint16 indexed referralCode)',
  LiquidationEvent: 'event LiquidationCall(address indexed collateralAsset,address indexed debtAsset,address indexed user,uint256 debtToCover,uint256 liquidatedCollateralAmount,address liquidator,bool receiveAToken)',
}
