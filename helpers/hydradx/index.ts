import { FetchOptions } from "../../adapters/types";
import * as sdk from "@defillama/sdk";

export interface HydraDXPoolConfig {
  version: 3;
  lendingPoolProxy: string;
  dataProvider: string;
}

const PercentageMathDecimals = 1e4;
const LiquidityIndexDecimals = BigInt(1e27);

export async function getHydraDXPoolFees(pool: HydraDXPoolConfig, options: FetchOptions, balances: {
  dailyFees: sdk.Balances,
  dailySupplySideRevenue: sdk.Balances,
  dailyProtocolRevenue: sdk.Balances,
}) {
  const reserves = await options.api.call({
    target: pool.lendingPoolProxy,
    abi: 'address[]:getReservesList',
  }).catch(() => []);
  
  if (reserves.length === 0) return;

  const currentReserveData = await Promise.all(
    reserves.map((reserve: string) =>
      options.api.call({
        target: pool.dataProvider,
        abi: 'function getReserveData(address asset) view returns (uint256 unbacked, uint256 accruedToTreasuryScaled, uint256 totalAToken, uint256 totalStableDebt, uint256 totalVariableDebt, uint256 liquidityRate, uint256 variableBorrowRate, uint256 stableBorrowRate, uint256 averageStableBorrowRate, uint256 liquidityIndex, uint256 variableBorrowIndex, uint40 lastUpdateTimestamp)',
        params: [reserve],
      }).catch(() => null)
    )
  );

  const previousReserveData = await Promise.all(
    reserves.map((reserve: string) =>
      options.fromApi.call({
        target: pool.dataProvider,
        abi: 'function getReserveData(address asset) view returns (uint256 unbacked, uint256 accruedToTreasuryScaled, uint256 totalAToken, uint256 totalStableDebt, uint256 totalVariableDebt, uint256 liquidityRate, uint256 variableBorrowRate, uint256 stableBorrowRate, uint256 averageStableBorrowRate, uint256 liquidityIndex, uint256 variableBorrowIndex, uint40 lastUpdateTimestamp)',
        params: [reserve],
      }).catch(() => null)
    )
  );

  let hasAnyGrowth = false;

  for (let i = 0; i < reserves.length; i++) {
    const current = currentReserveData[i];
    const previous = previousReserveData[i];
    
    if (current && previous && current.totalAToken > 0) {
      try {
        const reserveConfig = await options.api.call({
          target: pool.dataProvider,
          abi: 'function getReserveConfigurationData(address asset) view returns (uint256 decimals, uint256 ltv, uint256 liquidationThreshold, uint256 liquidationBonus, uint256 reserveFactor, bool usageAsCollateralEnabled, bool borrowingEnabled, bool stableBorrowRateEnabled, bool isActive, bool isFrozen)',
          params: [reserves[i]],
        }).catch(() => null);

        if (reserveConfig) {
          const reserveFactor = Number(reserveConfig.reserveFactor) / PercentageMathDecimals;
          const totalLiquidity = BigInt(current.totalAToken);
          
          const currentLiquidityIndex = BigInt(current.liquidityIndex);
          const previousLiquidityIndex = BigInt(previous.liquidityIndex);
          
          if (currentLiquidityIndex > previousLiquidityIndex) {
            const growthLiquidityIndex = currentLiquidityIndex - previousLiquidityIndex;
            const interestAccrued = totalLiquidity * growthLiquidityIndex / LiquidityIndexDecimals;
            const revenueAccrued = Number(interestAccrued) * reserveFactor;

            balances.dailyFees.add(reserves[i], interestAccrued);
            balances.dailySupplySideRevenue.add(reserves[i], Number(interestAccrued) - revenueAccrued);
            balances.dailyProtocolRevenue.add(reserves[i], revenueAccrued);
            hasAnyGrowth = true;
          }
        }
      } catch (e) {
        // Skip individual reserve calculation errors
      }
    }
  }

  if (!hasAnyGrowth) {
    for (let i = 0; i < reserves.length; i++) {
      const current = currentReserveData[i];
      
      if (current && current.totalAToken > 0) {
        try {
          const reserveConfig = await options.api.call({
            target: pool.dataProvider,
            abi: 'function getReserveConfigurationData(address asset) view returns (uint256 decimals, uint256 ltv, uint256 liquidationThreshold, uint256 liquidationBonus, uint256 reserveFactor, bool usageAsCollateralEnabled, bool borrowingEnabled, bool stableBorrowRateEnabled, bool isActive, bool isFrozen)',
            params: [reserves[i]],
          }).catch(() => null);

          if (reserveConfig) {
            const reserveFactor = Number(reserveConfig.reserveFactor) / PercentageMathDecimals;
            
            const totalBorrows = BigInt(current.totalVariableDebt) + BigInt(current.totalStableDebt);
            if (totalBorrows > 0 && current.variableBorrowRate > 0) {
              const borrowDailyRate = BigInt(current.variableBorrowRate) / BigInt(365);
              const totalDailyInterest = totalBorrows * borrowDailyRate / LiquidityIndexDecimals;
              const protocolShare = Number(totalDailyInterest) * reserveFactor;
              const supplierShare = Number(totalDailyInterest) - protocolShare;

              balances.dailyFees.add(reserves[i], totalDailyInterest);
              balances.dailyProtocolRevenue.add(reserves[i], protocolShare);
              balances.dailySupplySideRevenue.add(reserves[i], supplierShare);
            }
          }
        } catch (e) {
          // Skip individual reserve calculation errors
        }
      }
    }
  }
}
