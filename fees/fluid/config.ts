import { Chain } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import ADDRESSES from '../../helpers/coreAssets.json';
import { METRIC } from "../../helpers/metrics";

type IConfig = {
  [s: string | Chain] : {
    dataStartTimestamp: number
    revenueResolverExistAfterBlock: number
    vaultResolverExistAfterTimestamp: number
    vaultResolverExistAfterBlock: number
  }
}

export const zeroAddress = ADDRESSES.null

export const LIQUIDITY = "0x52aa899454998be5b000ad077a46bbe360f4e497"

export const CONFIG_FLUID: IConfig = {
  [CHAIN.ETHEREUM]: {
    dataStartTimestamp: 1708246655, // ~ when liquidity resolver was deployed
    revenueResolverExistAfterBlock: 19959852,
    // vault resolver related revenue only exists after this timestamp. revenue / fees before are negligible
    vaultResolverExistAfterTimestamp: 1708931052,
    vaultResolverExistAfterBlock: 19313700,
  },
  [CHAIN.ARBITRUM]: {
    dataStartTimestamp: 1720018638, // ~ before any activity started (block 228361633)
    revenueResolverExistAfterBlock: 228361632,
    // vault resolver related revenue only exists after this timestamp. revenue / fees before are negligible
    vaultResolverExistAfterTimestamp: 1720018637,
    vaultResolverExistAfterBlock: 228361632,
  },
  [CHAIN.BASE]: {
    dataStartTimestamp: 1723484700, // ~ before any activity started (block 18347681)
    revenueResolverExistAfterBlock: 18347681,
    // vault resolver related revenue only exists after this timestamp. revenue / fees before are negligible
    vaultResolverExistAfterTimestamp: 1723484700,
    vaultResolverExistAfterBlock: 18347681,
  },
  [CHAIN.POLYGON]: {
    dataStartTimestamp: 1741205235, // ~ before any activity started (block 68688825)
    revenueResolverExistAfterBlock: 68688825,
    // vault resolver related revenue only exists after this timestamp. revenue / fees before are negligible
    vaultResolverExistAfterTimestamp: 1741205235,
    vaultResolverExistAfterBlock: 68688825,
  },
  [CHAIN.PLASMA]: {
    dataStartTimestamp: 1757571400, // ~ before any activity started (block 643135)
    revenueResolverExistAfterBlock: 644820,
    // vault resolver related revenue only exists after this timestamp. revenue / fees before are negligible
    vaultResolverExistAfterTimestamp: 1757573257,
    vaultResolverExistAfterBlock: 644992,
  }
};

export const ABI: any = {
  revenueResolver: {
    calcRevenueSimulatedTime: "function calcRevenueSimulatedTime(uint256 totalAmounts_,uint256 exchangePricesAndConfig_,uint256 liquidityTokenBalance_,uint256 simulatedTimestamp_) public view returns (uint256 revenueAmount_)",
    getRevenue: "function getRevenue(address token_) public view returns (uint256 revenueAmount_)",
  },
  liquidityResolver: {
    listedTokens: "function listedTokens() public view returns (address[] listedTokens_)",
    getExchangePricesAndConfig: "function getExchangePricesAndConfig(address token_) public view returns (uint256)",
    getTotalAmounts: "function getTotalAmounts(address token_) public view returns (uint256)",
  },
  vaultResolver_before_19992222: {
    getAllVaultsAddresses: "function getAllVaultsAddresses() external view returns (address[] vaults_)",
    getVaultEntireData: "function getVaultEntireData(address vault_) view returns ((address vault, (address liquidity, address factory, address adminImplementation, address secondaryImplementation, address supplyToken, address borrowToken, uint8 supplyDecimals, uint8 borrowDecimals, uint256 vaultId, bytes32 liquiditySupplyExchangePriceSlot, bytes32 liquidityBorrowExchangePriceSlot, bytes32 liquidityUserSupplySlot, bytes32 liquidityUserBorrowSlot) constantVariables, (uint16 supplyRateMagnifier, uint16 borrowRateMagnifier, uint16 collateralFactor, uint16 liquidationThreshold, uint16 liquidationMaxLimit, uint16 withdrawalGap, uint16 liquidationPenalty, uint16 borrowFee, address oracle, uint256 oraclePrice, address rebalancer) configs, (uint256 lastStoredLiquiditySupplyExchangePrice, uint256 lastStoredLiquidityBorrowExchangePrice, uint256 lastStoredVaultSupplyExchangePrice, uint256 lastStoredVaultBorrowExchangePrice, uint256 liquiditySupplyExchangePrice, uint256 liquidityBorrowExchangePrice, uint256 vaultSupplyExchangePrice, uint256 vaultBorrowExchangePrice, uint256 supplyRateVault, uint256 borrowRateVault, uint256 supplyRateLiquidity, uint256 borrowRateLiquidity, uint256 rewardsRate) exchangePricesAndRates, (uint256 totalSupplyVault, uint256 totalBorrowVault, uint256 totalSupplyLiquidity, uint256 totalBorrowLiquidity, uint256 absorbedSupply, uint256 absorbedBorrow) totalSupplyAndBorrow, (uint256 withdrawLimit, uint256 withdrawableUntilLimit, uint256 withdrawable, uint256 borrowLimit, uint256 borrowableUntilLimit, uint256 borrowable, uint256 minimumBorrowing) limitsAndAvailability, (uint256 totalPositions, int256 topTick, uint256 currentBranch, uint256 totalBranch, uint256 totalBorrow, uint256 totalSupply, (uint256 status, int256 minimaTick, uint256 debtFactor, uint256 partials, uint256 debtLiquidity, uint256 baseBranchId, int256 baseBranchMinima) currentBranchState) vaultState, (bool modeWithInterest, uint256 supply, uint256 withdrawalLimit, uint256 lastUpdateTimestamp, uint256 expandPercent, uint256 expandDuration, uint256 baseWithdrawalLimit, uint256 withdrawableUntilLimit, uint256 withdrawable) liquidityUserSupplyData, (bool modeWithInterest, uint256 borrow, uint256 borrowLimit, uint256 lastUpdateTimestamp, uint256 expandPercent, uint256 expandDuration, uint256 baseBorrowLimit, uint256 maxBorrowLimit, uint256 borrowableUntilLimit, uint256 borrowable) liquidityUserBorrowData) vaultData_)",
  },
  vaultResolver_after_19992222: {
    getAllVaultsAddresses: "function getAllVaultsAddresses() external view returns (address[] vaults_)",
    getVaultEntireData: "function getVaultEntireData(address vault_) view returns ((address vault, (address liquidity, address factory, address adminImplementation, address secondaryImplementation, address supplyToken, address borrowToken, uint8 supplyDecimals, uint8 borrowDecimals, uint256 vaultId, bytes32 liquiditySupplyExchangePriceSlot, bytes32 liquidityBorrowExchangePriceSlot, bytes32 liquidityUserSupplySlot, bytes32 liquidityUserBorrowSlot) constantVariables, (uint16 supplyRateMagnifier, uint16 borrowRateMagnifier, uint16 collateralFactor, uint16 liquidationThreshold, uint16 liquidationMaxLimit, uint16 withdrawalGap, uint16 liquidationPenalty, uint16 borrowFee, address oracle, uint256 oraclePriceOperate, uint256 oraclePriceLiquidate, address rebalancer) configs, (uint256 lastStoredLiquiditySupplyExchangePrice, uint256 lastStoredLiquidityBorrowExchangePrice, uint256 lastStoredVaultSupplyExchangePrice, uint256 lastStoredVaultBorrowExchangePrice, uint256 liquiditySupplyExchangePrice, uint256 liquidityBorrowExchangePrice, uint256 vaultSupplyExchangePrice, uint256 vaultBorrowExchangePrice, uint256 supplyRateVault, uint256 borrowRateVault, uint256 supplyRateLiquidity, uint256 borrowRateLiquidity, uint256 rewardsRate) exchangePricesAndRates, (uint256 totalSupplyVault, uint256 totalBorrowVault, uint256 totalSupplyLiquidity, uint256 totalBorrowLiquidity, uint256 absorbedSupply, uint256 absorbedBorrow) totalSupplyAndBorrow, (uint256 withdrawLimit, uint256 withdrawableUntilLimit, uint256 withdrawable, uint256 borrowLimit, uint256 borrowableUntilLimit, uint256 borrowable, uint256 borrowLimitUtilization, uint256 minimumBorrowing) limitsAndAvailability, (uint256 totalPositions, int256 topTick, uint256 currentBranch, uint256 totalBranch, uint256 totalBorrow, uint256 totalSupply, (uint256 status, int256 minimaTick, uint256 debtFactor, uint256 partials, uint256 debtLiquidity, uint256 baseBranchId, int256 baseBranchMinima) currentBranchState) vaultState, (bool modeWithInterest, uint256 supply, uint256 withdrawalLimit, uint256 lastUpdateTimestamp, uint256 expandPercent, uint256 expandDuration, uint256 baseWithdrawalLimit, uint256 withdrawableUntilLimit, uint256 withdrawable) liquidityUserSupplyData, (bool modeWithInterest, uint256 borrow, uint256 borrowLimit, uint256 lastUpdateTimestamp, uint256 expandPercent, uint256 expandDuration, uint256 baseBorrowLimit, uint256 maxBorrowLimit, uint256 borrowableUntilLimit, uint256 borrowable, uint256 borrowLimitUtilization) liquidityUserBorrowData) vaultData_)",
  },
  vaultResolverSmart: {
    getAllVaultsAddresses: "function getAllVaultsAddresses() external view returns (address[] vaults_)",
    getVaultEntireData: "function getVaultEntireData(address vault_) view returns ((address vault, bool isSmartCol, bool isSmartDebt, (address liquidity, address factory, address operateImplementation, address adminImplementation, address secondaryImplementation, address deployer, address supply, address borrow, (address token0, address token1) supplyToken, (address token0, address token1) borrowToken, uint256 vaultId, uint256 vaultType, bytes32 supplyExchangePriceSlot, bytes32 borrowExchangePriceSlot, bytes32 userSupplySlot, bytes32 userBorrowSlot) constantVariables, (uint16 supplyRateMagnifier, uint16 borrowRateMagnifier, uint16 collateralFactor, uint16 liquidationThreshold, uint16 liquidationMaxLimit, uint16 withdrawalGap, uint16 liquidationPenalty, uint16 borrowFee, address oracle, uint256 oraclePriceOperate, uint256 oraclePriceLiquidate, address rebalancer, uint256 lastUpdateTimestamp) configs, (uint256 lastStoredLiquiditySupplyExchangePrice, uint256 lastStoredLiquidityBorrowExchangePrice, uint256 lastStoredVaultSupplyExchangePrice, uint256 lastStoredVaultBorrowExchangePrice, uint256 liquiditySupplyExchangePrice, uint256 liquidityBorrowExchangePrice, uint256 vaultSupplyExchangePrice, uint256 vaultBorrowExchangePrice, uint256 supplyRateLiquidity, uint256 borrowRateLiquidity, int256 supplyRateVault, int256 borrowRateVault, int256 rewardsOrFeeRateSupply, int256 rewardsOrFeeRateBorrow) exchangePricesAndRates, (uint256 totalSupplyVault, uint256 totalBorrowVault, uint256 totalSupplyLiquidityOrDex, uint256 totalBorrowLiquidityOrDex, uint256 absorbedSupply, uint256 absorbedBorrow) totalSupplyAndBorrow, (uint256 withdrawLimit, uint256 withdrawableUntilLimit, uint256 withdrawable, uint256 borrowLimit, uint256 borrowableUntilLimit, uint256 borrowable, uint256 borrowLimitUtilization, uint256 minimumBorrowing) limitsAndAvailability, (uint256 totalPositions, int256 topTick, uint256 currentBranch, uint256 totalBranch, uint256 totalBorrow, uint256 totalSupply, (uint256 status, int256 minimaTick, uint256 debtFactor, uint256 partials, uint256 debtLiquidity, uint256 baseBranchId, int256 baseBranchMinima) currentBranchState) vaultState, (bool modeWithInterest, uint256 supply, uint256 withdrawalLimit, uint256 lastUpdateTimestamp, uint256 expandPercent, uint256 expandDuration, uint256 baseWithdrawalLimit, uint256 withdrawableUntilLimit, uint256 withdrawable) liquidityUserSupplyData, (bool modeWithInterest, uint256 borrow, uint256 borrowLimit, uint256 lastUpdateTimestamp, uint256 expandPercent, uint256 expandDuration, uint256 baseBorrowLimit, uint256 maxBorrowLimit, uint256 borrowableUntilLimit, uint256 borrowable, uint256 borrowLimitUtilization) liquidityUserBorrowData) vaultData_)",
  },
  dexResolver: {
    getAllDexAddresses: "function getAllDexAddresses() external view returns (address[] dexes_)",
    getDexTokens: "function getDexTokens(address dex_) external view returns (address token0_, address token1_)",
    getDexState: "function getDexState(address dex_) returns ((uint256 lastToLastStoredPrice, uint256 lastStoredPrice, uint256 centerPrice, uint256 lastUpdateTimestamp, uint256 lastPricesTimeDiff, uint256 oracleCheckPoint, uint256 oracleMapping, uint256 totalSupplyShares, uint256 totalBorrowShares, bool isSwapAndArbitragePaused, (bool isRangeChangeActive, bool isThresholdChangeActive, bool isCenterPriceShiftActive, (uint256 oldUpper, uint256 oldLower, uint256 duration, uint256 startTimestamp, uint256 oldTime) rangeShift, (uint256 oldUpper, uint256 oldLower, uint256 duration, uint256 startTimestamp, uint256 oldTime) thresholdShift, (uint256 shiftPercentage, uint256 duration, uint256 startTimestamp) centerPriceShift) shifts, uint256 token0PerSupplyShare, uint256 token1PerSupplyShare, uint256 token0PerBorrowShare, uint256 token1PerBorrowShare) state_)"
  },
  vault: {
    constantsView: "function constantsView() public view returns((address liquidity,address factory,address adminImplementation,address secondaryImplementation,address supplyToken,address borrowToken,uint8 supplyDecimals,uint8 borrowDecimals,uint vaultId,bytes32 liquiditySupplyExchangePriceSlot,bytes32 liquidityBorrowExchangePriceSlot,bytes32 liquidityUserSupplySlot,bytes32 liquidityUserBorrowSlot))",
  },
};

export const EVENT_ABI: any = {
  logOperate: "event LogOperate(address indexed user,address indexed token,int256 supplyAmount,int256 borrowAmount,address withdrawTo,address borrowTo,uint256 totalAmounts,uint256 exchangePricesAndConfig)",
  logCollectRevenue: "event LogCollectRevenue(address indexed token, uint256 indexed amount)",
  logRebalance: "event LogRebalance(int colAmt_, int debtAmt_)"
}

export const TOPIC0: any = {
  logOperate: '0x4d93b232a24e82b284ced7461bf4deacffe66759d5c24513e6f29e571ad78d15',
  logCollectRevenue: '0x7ded56fbc1e1a41c85fd5fb3d0ce91eafc72414b7f06ed356c1d921823d4c37c',
  logRebalance: '0x9a85dfb89c634cdc63db5d8cedaf8f9cfa4926df888bad563d70b7314a33a0ae'
}

export const METHODOLOGY_FLUID = {
  Fees: "Interest paid by borrowers",
  Revenue: "Percentage of interest going to treasury",
  ProtocolRevenue: "Percentage of interest going to treasury",
};

export const BREAKDOWN_METHODOLOGY_FLUID = {
  Fees: {
    [METRIC.BORROW_INTEREST]: "Interest paid by borrowers",
  },
  Revenue: {
    [METRIC.BORROW_INTEREST]: "Percentage of interest going to treasury",
  },
  ProtocolRevenue: {
    [METRIC.BORROW_INTEREST]: "Percentage of interest going to treasury",
  },
};

export const parseInTopic = (address: string): string => {
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
      throw new Error('Invalid EVM address');
  }
  return `0x000000000000000000000000${address.slice(2).toLowerCase()}`;
}