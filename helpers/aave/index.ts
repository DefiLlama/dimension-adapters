import { BaseAdapter, FetchOptions, IJSON, SimpleAdapter } from "../../adapters/types";
import * as sdk from "@defillama/sdk";
import AaveAbis from './abi';

export interface AaveLendingPoolConfig {
  version: 1 | 2 | 3;
  lendingPoolProxy: string;
  dataProvider: string;
}

// PercentageMath uses 4 decimals: https://etherscan.io/address/0x02d84abd89ee9db409572f19b6e1596c301f3c81#code#F17#L15
const ReserveFactorDecimals = 1e4;

// https://etherscan.io/address/0x02d84abd89ee9db409572f19b6e1596c301f3c81#code#F16#L16
const LiquidityIndexDecimals = BigInt(1e27);

async function getPoolFees(pool: AaveLendingPoolConfig, options: FetchOptions, balances: {
  dailyFees: sdk.Balances,
  dailyProtocolRevenue: sdk.Balances,
}) {
  // get reserve (token) list which are supported by the lending pool
  const reservesList: Array<string> = await options.api.call({
    target: pool.lendingPoolProxy,
    abi: pool.version === 1 ? AaveAbis.getReserves : AaveAbis.getReservesList
  })

  // in this case the market is not exists yet
  if (!reservesList || reservesList.length == 0) {
    return;
  }

  // get reserves factors
  const reserveFactors: Array<number> = pool.version === 1
    ? reservesList.map(_ => 0)
    : (await options.api.multiCall({
      abi: AaveAbis.getReserveConfiguration,
      target: pool.dataProvider,
      calls: reservesList,
    })).map((config: any) => Number(config.reserveFactor))

  // count fees by growth liquidity index
  const reserveDataBefore = await options.fromApi.multiCall({
    abi: pool.version === 1 ? AaveAbis.getReserveDataV1 : pool.version === 2 ? AaveAbis.getReserveDataV2 : AaveAbis.getReserveDataV3,
    target: pool.dataProvider,
    calls: reservesList,
  })
  const reserveDataAfter = await options.toApi.multiCall({
    abi: pool.version === 1 ? AaveAbis.getReserveDataV1 : pool.version === 2 ? AaveAbis.getReserveDataV2 : AaveAbis.getReserveDataV3,
    target: pool.dataProvider,
    calls: reservesList,
  })

  // all calculations use BigInt because aave math has 27 decimals
  for (let reserveIndex = 0; reserveIndex < reservesList.length; reserveIndex++) {
    let totalLiquidity = BigInt(0)
    if (pool.version === 1) {
      totalLiquidity = BigInt(reserveDataBefore[reserveIndex].totalLiquidity)
    } else if (pool.version === 2) {
      // = available + borrowed
      totalLiquidity = BigInt(reserveDataBefore[reserveIndex].availableLiquidity)
        + BigInt(reserveDataBefore[reserveIndex].totalStableDebt)
        + BigInt(reserveDataBefore[reserveIndex].totalVariableDebt)
    } else {
      totalLiquidity = BigInt(reserveDataBefore[reserveIndex].totalAToken)
    }

    const reserveFactor = reserveFactors[reserveIndex] / ReserveFactorDecimals
    const reserveLiquidityIndexBefore = BigInt(reserveDataBefore[reserveIndex].liquidityIndex)
    const reserveLiquidityIndexAfter = BigInt(reserveDataAfter[reserveIndex].liquidityIndex)
    const growthLiquidityIndex = reserveLiquidityIndexAfter - reserveLiquidityIndexBefore
    const interestAccrued = totalLiquidity * growthLiquidityIndex / LiquidityIndexDecimals
    const revenueAccrued = Number(interestAccrued) * reserveFactor

    balances.dailyFees.add(reservesList[reserveIndex], interestAccrued)
    balances.dailyProtocolRevenue.add(reservesList[reserveIndex], revenueAccrued)
  }
}

export function aaveExport(config: IJSON<Array<AaveLendingPoolConfig>>) {
  const exportObject: BaseAdapter = {}
  Object.entries(config).map(([chain, pools]) => {
    exportObject[chain] = {
      fetch: (async (options: FetchOptions) => {
        let dailyFees = options.createBalances()
        let dailyProtocolRevenue = options.createBalances()

        for (const pool of pools) {
          await getPoolFees(pool, options, {
            dailyFees,
            dailyProtocolRevenue,
          })
        }

        const dailySupplySideRevenue = dailyFees.clone();
        dailySupplySideRevenue.subtract(dailyProtocolRevenue);
        
        return { dailyFees, dailyProtocolRevenue, dailySupplySideRevenue }
      }),
    }
  })
  return { adapter: exportObject, version: 2 } as SimpleAdapter
}