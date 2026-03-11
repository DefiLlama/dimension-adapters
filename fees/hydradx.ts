import { CHAIN } from "../helpers/chains";
import { SimpleAdapter, FetchOptions } from "../adapters/types";
import AaveAbis from '../helpers/aave/abi';

const PercentageMathDecimals = 1e4;
const LiquidityIndexDecimals = BigInt(1e27);

const fetch = async (options: FetchOptions) => {
  let dailyFees = options.createBalances()
  let dailyProtocolRevenue = options.createBalances()
  let dailySupplySideRevenue = options.createBalances()

  const pool = {
    version: 3 as const,
    lendingPoolProxy: '0x1b02E051683b5cfaC5929C25E84adb26ECf87B38',
    dataProvider: '0xdf18300261edfF47b28c6a6adBCBCf468B52e5a5',
  }

  // get reserve (token) list which are supported by the lending pool
  const reservesList: Array<string> = await options.fromApi.call({
    target: pool.lendingPoolProxy,
    abi: AaveAbis.getReservesList,
    permitFailure: true,
  })

  // in this case the market is not exists yet
  if (!reservesList || reservesList.length == 0) {
    return {
      dailyFees,
      dailyRevenue: dailyProtocolRevenue,
      dailyProtocolRevenue,
      dailySupplySideRevenue,
    };
  }

  // get reserve configs
  const reserveConfigs = await options.fromApi.multiCall({
    abi: AaveAbis.getReserveConfiguration,
    target: pool.dataProvider,
    calls: reservesList,
  })
  
  // get reserves factors
  const reserveFactors: Array<number> = reserveConfigs.map((config: any) => Number(config.reserveFactor))

  // count fees by growth liquidity index
  const reserveDataBefore = await options.fromApi.multiCall({
    abi: AaveAbis.getReserveDataV3,
    target: pool.dataProvider,
    calls: reservesList,
  })
  const reserveDataAfter = await options.toApi.multiCall({
    abi: AaveAbis.getReserveDataV3,
    target: pool.dataProvider,
    calls: reservesList,
  })

  let hasAnyGrowth = false;

  // all calculations use BigInt because aave math has 27 decimals
  for (let reserveIndex = 0; reserveIndex < reservesList.length; reserveIndex++) {
    let totalLiquidity = BigInt(0)
    // for v3, use totalAToken directly
    totalLiquidity = BigInt(reserveDataBefore[reserveIndex].totalAToken)

    const reserveFactor = reserveFactors[reserveIndex] / PercentageMathDecimals
    const reserveLiquidityIndexBefore = BigInt(reserveDataBefore[reserveIndex].liquidityIndex)
    const reserveLiquidityIndexAfter = BigInt(reserveDataAfter[reserveIndex].liquidityIndex)
    const growthLiquidityIndex = reserveLiquidityIndexAfter - reserveLiquidityIndexBefore
    
    if (growthLiquidityIndex > 0) {
      const interestAccrued = totalLiquidity * growthLiquidityIndex / LiquidityIndexDecimals
      const revenueAccrued = Number(interestAccrued) * reserveFactor

      dailyFees.add(reservesList[reserveIndex], interestAccrued)
      dailySupplySideRevenue.add(reservesList[reserveIndex], Number(interestAccrued) - revenueAccrued)
      dailyProtocolRevenue.add(reservesList[reserveIndex], revenueAccrued)
      hasAnyGrowth = true;
    }
  }

  // Fallback calculation when no liquidity index growth is detected
  if (!hasAnyGrowth) {
    for (let i = 0; i < reservesList.length; i++) {
      const current = reserveDataAfter[i];
      
      if (current && (current.totalAToken > 0 || (current.totalVariableDebt > 0 || current.totalStableDebt > 0))) {
        const reserveConfig = await options.fromApi.call({
          target: pool.dataProvider,
          abi: AaveAbis.getReserveConfiguration,
          params: [reservesList[i]],
        });

        if (reserveConfig) {
          const reserveFactor = Number(reserveConfig.reserveFactor) / PercentageMathDecimals;
          
          const totalBorrows = BigInt(current.totalVariableDebt) + BigInt(current.totalStableDebt);
          if (totalBorrows > 0 && current.variableBorrowRate > 0) {
            const borrowDailyRate = BigInt(current.variableBorrowRate) / BigInt(365);
            const totalDailyInterest = totalBorrows * borrowDailyRate / LiquidityIndexDecimals;
            const protocolShare = Number(totalDailyInterest) * reserveFactor;
            const supplierShare = Number(totalDailyInterest) - protocolShare;

            dailyFees.add(reservesList[i], totalDailyInterest);
            dailyProtocolRevenue.add(reservesList[i], protocolShare);
            dailySupplySideRevenue.add(reservesList[i], supplierShare);
          }
        }
      }
    }
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
      fetch,
      start: '2024-11-26',
    }
  }
}

export default adapter
