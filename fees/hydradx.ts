import { CHAIN } from "../helpers/chains";
import { SimpleAdapter, FetchOptions } from "../adapters/types";
import { getPoolFees } from "../helpers/aave";

const fetchHydraDXFees = async (options: FetchOptions) => {
  let dailyFees = options.createBalances()
  let dailyProtocolRevenue = options.createBalances()
  let dailySupplySideRevenue = options.createBalances()

  const startTimestamp = new Date('2024-11-26').getTime() / 1000;
  if (options.endTimestamp < startTimestamp) {
    return {
      dailyFees,
      dailyRevenue: dailyProtocolRevenue,
      dailyProtocolRevenue,
      dailySupplySideRevenue,
    }
  }

  const pool = {
    version: 3 as const,
    lendingPoolProxy: '0x1b02E051683b5cfaC5929C25E84adb26ECf87B38',
    dataProvider: '0xdf18300261edfF47b28c6a6adBCBCf468B52e5a5',
  }

  try {
    const startBlock = await options.getStartBlock().catch(() => null);
    const endBlock = await options.getEndBlock().catch(() => null);
    
    if (startBlock && endBlock) {
      await getPoolFees(pool, options, {
        dailyFees,
        dailySupplySideRevenue,
        dailyProtocolRevenue,
      })
      
      return {
        dailyFees,
        dailyRevenue: dailyProtocolRevenue,
        dailyProtocolRevenue,
        dailySupplySideRevenue,
      }
    }
  } catch (error: any) {
    if (!error.message.includes('fromBlock or fromTimestamp')) {
      console.warn(`HydraDX: Aave helper failed:`, error.message);
    }
  }

  try {
    const reserves = await options.api.call({
      target: pool.lendingPoolProxy,
      abi: 'address[]:getReservesList',
    }).catch(() => []);
    
    if (reserves.length === 0) return {
      dailyFees,
      dailyRevenue: dailyProtocolRevenue,
      dailyProtocolRevenue,
      dailySupplySideRevenue,
    };

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

    const LiquidityIndexDecimals = BigInt(1e27);
    const PercentageMathDecimals = 1e4;
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

              dailyFees.add(reserves[i], interestAccrued);
              dailySupplySideRevenue.add(reserves[i], Number(interestAccrued) - revenueAccrued);
              dailyProtocolRevenue.add(reserves[i], revenueAccrued);
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

                dailyFees.add(reserves[i], totalDailyInterest);
                dailyProtocolRevenue.add(reserves[i], protocolShare);
                dailySupplySideRevenue.add(reserves[i], supplierShare);
              }
            }
          } catch (e) {
            // Skip individual reserve calculation errors
          }
        }
      }
    }
  } catch (error: any) {
    // Silent fallback
  }

  return {
    dailyFees,
    dailyRevenue: dailyProtocolRevenue,
    dailyProtocolRevenue,
    dailySupplySideRevenue,
  }
}

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.HYDRADX]: {
      fetch: fetchHydraDXFees,
      start: '2024-11-26',
    }
  }
}

export default adapter
