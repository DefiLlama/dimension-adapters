import { BaseAdapter, FetchOptions, IStartTimestamp } from "../../adapters/types";
import * as sdk from "@defillama/sdk";
import AaveAbis from './abi';
import {decodeReserveConfig} from "./helper";
import { METRIC } from '../../helpers/metrics';

export interface AaveLendingPoolConfig {
  version: 1 | 2 | 3;
  lendingPoolProxy: string;
  dataProvider: string;
  ignoreLiquidation?: boolean;
  ignoreFlashloan?: boolean;

  // GHO on aave
  selfLoanAssets?: {
    // address => symbol
    [key: string]: string;
  },
}

export interface AaveAdapterExportConfig {
  start?: IStartTimestamp | number | string;
  pools: Array<AaveLendingPoolConfig>;
}

// PercentageMath uses 4 decimals: https://etherscan.io/address/0x02d84abd89ee9db409572f19b6e1596c301f3c81#code#F17#L15
const PercentageMathDecimals = 1e4;
// BigInt version to keep reserveFactor math exact (avoid float precision loss).
const PercentageMathDecimalsBI = 10000n;

// https://etherscan.io/address/0x02d84abd89ee9db409572f19b6e1596c301f3c81#code#F16#L16
const LiquidityIndexDecimals = BigInt(1e27);
const SECONDS_PER_YEAR = 31536000n;

export async function getPoolFees(pool: AaveLendingPoolConfig, options: FetchOptions, balances: {
  dailyFees: sdk.Balances,
  dailySupplySideRevenue: sdk.Balances,
  dailyProtocolRevenue: sdk.Balances,
}) {
  // get reserve (token) list which are supported by the lending pool
  const reservesList: Array<string> = await options.fromApi.call({
    target: pool.lendingPoolProxy,
    abi: pool.version === 1 ? AaveAbis.getReserves : AaveAbis.getReservesList,
    permitFailure: true,
  })

  // in this case the market is not exists yet
  if (!reservesList || reservesList.length == 0) {
    return;
  }

  // get reserve configs
  const reserveConfigs = pool.version === 1 ? [] : await options.fromApi.multiCall({
    abi: AaveAbis.getReserveConfiguration,
    target: pool.dataProvider,
    calls: reservesList,
  })
  
  // get reserves factors
  const reserveFactors: Array<number> = pool.version === 1
    ? reservesList.map(_ => 0)
    : reserveConfigs.map((config: any) => Number(config.reserveFactor))

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

  // time delta in seconds between start and end blocks
  const timeDelta = BigInt(options.toTimestamp - options.fromTimestamp)

  // all calculations use BigInt because aave math has 27 decimals
  for (let reserveIndex = 0; reserveIndex < reservesList.length; reserveIndex++) {
    let totalVariableDebt = BigInt(0)
    let totalStableDebt = BigInt(0)
    let avgStableBorrowRate = BigInt(0)
    if (pool.version === 1) {
      // V1 exposes variable debt as totalBorrowsVariable; default to 0 if missing.
      totalVariableDebt = BigInt(reserveDataBefore[reserveIndex].totalBorrowsVariable ?? 0)
      totalStableDebt = BigInt(reserveDataBefore[reserveIndex].totalBorrowsStable ?? 0)
      avgStableBorrowRate = BigInt(reserveDataBefore[reserveIndex].averageStableBorrowRate ?? 0)
    } else {
      totalVariableDebt = BigInt(reserveDataBefore[reserveIndex].totalVariableDebt)
      totalStableDebt = BigInt(reserveDataBefore[reserveIndex].totalStableDebt)
      avgStableBorrowRate = BigInt(reserveDataBefore[reserveIndex].averageStableBorrowRate)
    }

    const token = reservesList[reserveIndex].toLowerCase()
    // Keep reserve factor in bps as BigInt for ratio math.
    const reserveFactorBps = BigInt(reserveFactors[reserveIndex])

    if (pool.selfLoanAssets && pool.selfLoanAssets[token]) {
      // self-loan assets, no supply-side revenue
      const symbol = pool.selfLoanAssets[token]
      const reserveVariableBorrowIndexBefore = BigInt(reserveDataBefore[reserveIndex].variableBorrowIndex)
      const reserveVariableBorrowIndexAfter = BigInt(reserveDataAfter[reserveIndex].variableBorrowIndex)
      const growthVariableBorrowIndex = reserveVariableBorrowIndexAfter - reserveVariableBorrowIndexBefore
      // totalVariableDebt is already index-applied, so divide by the prior index (not RAY) to get interest delta.
      const interestAccrued = reserveVariableBorrowIndexBefore === 0n
        ? 0n
        : totalVariableDebt * growthVariableBorrowIndex / reserveVariableBorrowIndexBefore

      balances.dailyFees.add(token, interestAccrued, `${METRIC.BORROW_INTEREST} ${symbol}`)
      balances.dailySupplySideRevenue.add(token, 0, `${METRIC.BORROW_INTEREST} ${symbol}`)
      balances.dailyProtocolRevenue.add(token, interestAccrued, `${METRIC.BORROW_INTEREST} ${symbol}`)
    } else {
      // Variable debt interest: use variableBorrowIndex to calculate interest
      // (avoids flashloan supply premium contamination and works for 100% RF)
      const reserveVariableBorrowIndexBefore = BigInt(reserveDataBefore[reserveIndex].variableBorrowIndex)
      const reserveVariableBorrowIndexAfter = BigInt(reserveDataAfter[reserveIndex].variableBorrowIndex)
      const growthVariableBorrowIndex = reserveVariableBorrowIndexAfter - reserveVariableBorrowIndexBefore
      // totalVariableDebt is already index-applied, so divide by the prior index (not RAY) to get interest delta.
      const variableInterest = reserveVariableBorrowIndexBefore === 0n
        ? 0n
        : totalVariableDebt * growthVariableBorrowIndex / reserveVariableBorrowIndexBefore

      // Stable debt interest: calculate from average stable rate and time delta
      // stableInterest = totalStableDebt * avgStableRate * timeDelta / SECONDS_PER_YEAR / RAY
      const stableInterest = totalStableDebt * avgStableBorrowRate * timeDelta / SECONDS_PER_YEAR / LiquidityIndexDecimals

      const totalInterest = variableInterest + stableInterest

      // Split by reserve factor: protocol gets RF%, suppliers get (1-RF)%
      const protocolInterest = totalInterest * reserveFactorBps / PercentageMathDecimalsBI
      const supplyInterest = totalInterest - protocolInterest

      balances.dailyFees.add(token, totalInterest, METRIC.BORROW_INTEREST)
      balances.dailySupplySideRevenue.add(token, supplyInterest, METRIC.BORROW_INTEREST)
      balances.dailyProtocolRevenue.add(token, protocolInterest, METRIC.BORROW_INTEREST)
    }
  }

  if (!pool.ignoreFlashloan) {
    // get flashloan fees
    const flashloanEvents = await options.getLogs({
      target: pool.lendingPoolProxy,
      eventAbi: AaveAbis.FlashloanEvent,
    })
    if (flashloanEvents.length > 0) {
      // const FLASHLOAN_PREMIUM_TOTAL = await options.fromApi.call({
      //   target: pool.lendingPoolProxy,
      //   abi: AaveAbis.FLASHLOAN_PREMIUM_TOTAL,
      // })
      const FLASHLOAN_PREMIUM_TO_PROTOCOL = await options.fromApi.call({
        target: pool.lendingPoolProxy,
        abi: AaveAbis.FLASHLOAN_PREMIUM_TO_PROTOCOL,
      })
      // const flashloanFeeRate = Number(FLASHLOAN_PREMIUM_TOTAL) / 1e4
      const flashloanFeeProtocolRate = Number(FLASHLOAN_PREMIUM_TO_PROTOCOL) / 1e4
  
      for (const event of flashloanEvents) {
        const flashloanPremiumForProtocol = Number(event.premium) * flashloanFeeProtocolRate
        const flashloanPremiumForSupply = Number(event.premium) - flashloanPremiumForProtocol

        balances.dailyFees.add(event.asset, event.premium, METRIC.FLASHLOAN_FEES)
        balances.dailyProtocolRevenue.add(event.asset, flashloanPremiumForProtocol, METRIC.FLASHLOAN_FEES)
        balances.dailySupplySideRevenue.add(event.asset, flashloanPremiumForSupply, METRIC.FLASHLOAN_FEES)
      }
    }
  }

  if (!pool.ignoreLiquidation) {
    // aave v3 has liquidation protocol fees which is a partition from liquidation bonus
    if (pool.version === 3) {
      const liquidationEvents: Array<any> = await options.getLogs({
        target: pool.lendingPoolProxy,
        eventAbi: AaveAbis.LiquidationEvent,
      })
      if (liquidationEvents.length > 0) {
        const liquidationProtocolFees = (await options.api.multiCall({
          abi: AaveAbis.getConfiguration,
          target: pool.lendingPoolProxy,
          calls: reservesList,
        })).map((config: any) => {
          return Number(decodeReserveConfig(config.data).liquidationProtocolFee)
        })
    
        const reserveLiquidationConfigs: {[key: string]: {
          bonus: number;
          protocolFee: number;
        }} = {}
        for (let i = 0; i < reservesList.length; i++) {
          reserveLiquidationConfigs[sdk.util.normalizeAddress(reservesList[i])] = {
            bonus: Number(reserveConfigs[i].liquidationBonus),
            protocolFee: liquidationProtocolFees[i],
          }
        }
  
        for (const event of liquidationEvents) {
          /**
           * The math calculation for liquidation fees
           * 
           * where:
           * e - collateral amount emitted from the event
           * x - liquidation bonus rate
           * y - liquidation protocol fee rate
           * a - liquidated collateral amount
           * b - liquidation bonus
           * b2 - liquidation bonus fees for protocol
           * 
           * 1. b2 = yb
           * 
           * 2. e = a + b
           * 
           * 3. b = xa
           * 
           * from 1, 2, 3:
           * b = (e - e / x)
           * b2 = b * y
           * 
           */
    
          const e = Number(event.liquidatedCollateralAmount)
          const x = reserveLiquidationConfigs[sdk.util.normalizeAddress(event.collateralAsset)].bonus / PercentageMathDecimals
          const y = reserveLiquidationConfigs[sdk.util.normalizeAddress(event.collateralAsset)].protocolFee / PercentageMathDecimals
  
          // protocol fees from liquidation bonus
          const b = (e - e / x)
          const b2 = b * y
  
          // count liquidation bonus as fees
          balances.dailyFees.add(event.collateralAsset, b, METRIC.LIQUIDATION_FEES)
  
          // count liquidation bonus for liquidator as supply side fees
          balances.dailySupplySideRevenue.add(event.collateralAsset, b - b2, METRIC.LIQUIDATION_FEES)
  
          // count liquidation bonus protocol fee as revenue
          balances.dailyProtocolRevenue.add(event.collateralAsset, b2, METRIC.LIQUIDATION_FEES)
        }
      }
    }
  }
}

export function aaveExport(exportConfig: {[key: string]: AaveAdapterExportConfig}) {
  const exportObject: BaseAdapter = {}
  Object.entries(exportConfig).map(([chain, config]) => {
    exportObject[chain] = {
      fetch: (async (options: FetchOptions) => {
        let dailyFees = options.createBalances()
        let dailyProtocolRevenue = options.createBalances()
        let dailySupplySideRevenue = options.createBalances()

        for (const pool of config.pools) {
          await getPoolFees(pool, options, {
            dailyFees,
            dailySupplySideRevenue,
            dailyProtocolRevenue,
          })
        }

        return {
          dailyFees,
          dailyRevenue: dailyProtocolRevenue,
          dailyProtocolRevenue,
          dailySupplySideRevenue,
        }
      }),
      start: config.start,
    }
  })
  return exportObject
}