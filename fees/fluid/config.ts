import { Chain } from "@defillama/sdk/build/general";
import { CHAIN } from "../../helpers/chains";

type IConfig = {
  [s: string | Chain] : {
    dataStartTimestamp: number
    revenueResolverExistAfterBlock: number
    vaultResolverExistAfterTimestamp: number
    vaultResolverExistAfterBlock: number
  }
}

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
};

export const parseInTopic = (address: string): string => {
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
      throw new Error('Invalid EVM address');
  }
  return `0x000000000000000000000000${address.slice(2).toLowerCase()}`;
}