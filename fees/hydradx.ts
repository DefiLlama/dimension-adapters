import { CHAIN } from "../helpers/chains";
import { SimpleAdapter, FetchOptions } from "../adapters/types";
import AaveAbis from '../helpers/aave/abi';
import { METRIC } from "../helpers/metrics";

const PercentageMathDecimals = 1e4;
const LiquidityIndexDecimals = BigInt(1e27);
const SECONDS_PER_YEAR = BigInt(365 * 24 * 60 * 60);

// HOLLAR is a CDP stablecoin: users cannot supply it, on-chain RF = 0%, totalAToken = 0.
// All borrow interest is protocol revenue. Tracked separately via rate × debt.
const HOLLAR = '0x531a654d1696ed52e7275a8cede955e82620f99a'

// Money-market pool on Hydration EVM (Aave V3 fork).
const pool = {
  version: 3 as const,
  lendingPoolProxy: '0x1b02E051683b5cfaC5929C25E84adb26ECf87B38',
  dataProvider: '0xdf18300261edfF47b28c6a6adBCBCf468B52e5a5',
}

const fetch = async (options: FetchOptions) => {
  let dailyFees = options.createBalances()
  let dailyProtocolRevenue = options.createBalances()
  let dailySupplySideRevenue = options.createBalances()

  // Window length for rate-based accruals (HOLLAR + index-growth fallback).
  // Never assume 86400 — v2 runs hourly.
  const windowSeconds = BigInt(Math.max(0, options.toTimestamp - options.fromTimestamp))

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

  // HOLLAR: CDP stablecoin — users cannot supply it, only the treasury mints it.
  // totalAToken = 0, liquidity index never grows. Borrow index only updates on-chain
  // when a transaction touches HOLLAR, so index-based tracking misses quiet days.
  // Always use rate × debt estimate, 100% is protocol revenue.
  // Computed unconditionally here so it doesn't interfere with hasAnyGrowth logic below.
  const hollarIndex = reservesList.findIndex(r => r.toLowerCase() === HOLLAR)
  if (hollarIndex >= 0 && windowSeconds > 0n) {
    const totalDebt = BigInt(reserveDataBefore[hollarIndex].totalVariableDebt)
    const borrowRate = BigInt(reserveDataBefore[hollarIndex].variableBorrowRate)
    if (totalDebt > 0 && borrowRate > 0) {
      const interest = totalDebt * borrowRate * windowSeconds / SECONDS_PER_YEAR / LiquidityIndexDecimals
      const interestUSD = Number(interest) / 1e18
      dailyFees.addUSDValue(interestUSD, METRIC.BORROW_INTEREST)
      dailyProtocolRevenue.addUSDValue(interestUSD, 'Borrow Interest To Treasury')
    }
  }

  let hasAnyGrowth = false;

  // all calculations use BigInt because aave math has 27 decimals
  for (let reserveIndex = 0; reserveIndex < reservesList.length; reserveIndex++) {
    if (reservesList[reserveIndex].toLowerCase() === HOLLAR) continue

    // for v3, use totalAToken directly
    const totalLiquidity = BigInt(reserveDataBefore[reserveIndex].totalAToken)
    const reserveFactor = reserveFactors[reserveIndex] / PercentageMathDecimals
    const reserveLiquidityIndexBefore = BigInt(reserveDataBefore[reserveIndex].liquidityIndex)
    const reserveLiquidityIndexAfter = BigInt(reserveDataAfter[reserveIndex].liquidityIndex)
    const growthLiquidityIndex = reserveLiquidityIndexAfter - reserveLiquidityIndexBefore

    if (growthLiquidityIndex > 0) {
      const interestAccrued = totalLiquidity * growthLiquidityIndex / LiquidityIndexDecimals
      const revenueAccrued = Number(interestAccrued) * reserveFactor
      const supplierShare = Number(interestAccrued) - revenueAccrued

      dailyFees.add(reservesList[reserveIndex], interestAccrued, METRIC.BORROW_INTEREST)
      dailySupplySideRevenue.add(reservesList[reserveIndex], supplierShare, 'Borrow Interest To Lenders')
      dailyProtocolRevenue.add(reservesList[reserveIndex], revenueAccrued, 'Borrow Interest To Treasury')
      hasAnyGrowth = true;
    }
  }

  // Fallback calculation when no liquidity index growth is detected
  if (!hasAnyGrowth && windowSeconds > 0n) {
    for (let i = 0; i < reservesList.length; i++) {
      const current = reserveDataAfter[i];

      if (current && (current.totalAToken > 0 || current.totalVariableDebt > 0 || current.totalStableDebt > 0)) {
        if (reservesList[i].toLowerCase() === HOLLAR) continue // already handled above

        const reserveFactor = reserveFactors[i] / PercentageMathDecimals;
        const totalBorrows = BigInt(current.totalVariableDebt) + BigInt(current.totalStableDebt);
        if (totalBorrows > 0 && current.variableBorrowRate > 0) {
          const borrowRate = BigInt(current.variableBorrowRate);
          const totalInterest = totalBorrows * borrowRate * windowSeconds / SECONDS_PER_YEAR / LiquidityIndexDecimals;
          const protocolShare = Number(totalInterest) * reserveFactor;
          const supplierShare = Number(totalInterest) - protocolShare;

          dailyFees.add(reservesList[i], totalInterest, METRIC.BORROW_INTEREST);
          dailyProtocolRevenue.add(reservesList[i], protocolShare, 'Borrow Interest To Treasury');
          dailySupplySideRevenue.add(reservesList[i], supplierShare, 'Borrow Interest To Lenders');
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

const methodology = {
  Fees:
    'Borrow interest across Hydration money-market reserves (including HOLLAR CDP debt). Excludes money-market liquidation penalties, PEPL liquidation profit, and HSM revenue — those Substrate/runtime streams previously came from hydration-metrics-aggregator.indexer.hydration.cloud, which has returned 404 since 2026-08-29, and Hydration has no block-by-timestamp resolution for EVM getLogs.',
  Revenue:
    'Protocol share of borrow interest (reserve factor on supplied reserves, and 100% of HOLLAR CDP interest).',
  ProtocolRevenue:
    'Same as Revenue — Hydration treasury share of money-market borrow interest.',
  SupplySideRevenue:
    'Borrow interest paid to money-market lenders.',
}

const breakdownMethodology = {
  Fees: {
    [METRIC.BORROW_INTEREST]: 'Interest paid by borrowers across all money market reserves, including HOLLAR CDP debt.',
  },
  Revenue: {
    'Borrow Interest To Treasury': 'Protocol reserve-factor share of borrow interest, and 100% of HOLLAR CDP interest.',
  },
  ProtocolRevenue: {
    'Borrow Interest To Treasury': 'Protocol reserve-factor share of borrow interest, and 100% of HOLLAR CDP interest.',
  },
  SupplySideRevenue: {
    'Borrow Interest To Lenders': 'Borrow interest distributed to money-market lenders.',
  },
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  adapter: {
    [CHAIN.HYDRADX]: {
      fetch,
      start: '2024-11-26',
    }
  },
  methodology,
  breakdownMethodology,
}

export default adapter
