import { CHAIN } from "../helpers/chains";
import { SimpleAdapter, FetchOptions } from "../adapters/types";
import AaveAbis from '../helpers/aave/abi';
import { METRIC } from "../helpers/metrics";

const FEES_API = "https://hydration-metrics-aggregator.indexer.hydration.cloud/api/v1/fees/charts"

// Streams not covered by the EVM lending calculation below:
// - liquidation_penalty: treasury's 10% cut from MM liquidations (event-based, not in liquidity index)
// - pepl_liquidation_profit: 100% protocol revenue from PEPL liquidations
// - hsm_revenue: HSM arb profits + yield from yield-bearing stablecoins
const EXTRA_PROTOCOL_STREAMS = [
  { productType: "money-market", streamType: "liquidation_penalty", label: "Liquidation Fees", revenueLabel: "Liquidation Penalty To Treasury" },
  { productType: "money-market", streamType: "pepl_liquidation_profit", label: "PEPL Liquidation Profit", revenueLabel: "PEPL Liquidation Profit To Treasury" },
  { productType: "hollar", streamType: "hsm_revenue", label: "HSM Revenue", revenueLabel: "HSM Revenue To Treasury" },
] as const

async function fetchProtocolStream(productType: string, streamType: string, startTime: string, endTime: string): Promise<number> {
  const params = new URLSearchParams({ productType, feeDestination: "protocol", streamType, startTime, endTime, bucketSize: "24hour" })
  const res = await globalThis.fetch(`${FEES_API}?${params}`)
  const json = await res.json()
  return Math.max(0, json.periodAggregate ?? 0)
}

const PercentageMathDecimals = 1e4;
const LiquidityIndexDecimals = BigInt(1e27);

// HOLLAR is a CDP stablecoin: users cannot supply it, on-chain RF = 0%, totalAToken = 0.
// All borrow interest is protocol revenue. Tracked separately via rate × debt.
const HOLLAR = '0x531a654d1696ed52e7275a8cede955e82620f99a'

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

  // HOLLAR: CDP stablecoin — users cannot supply it, only the treasury mints it.
  // totalAToken = 0, liquidity index never grows. Borrow index only updates on-chain
  // when a transaction touches HOLLAR, so index-based tracking misses quiet days.
  // Always use rate × debt estimate, 100% is protocol revenue.
  // Computed unconditionally here so it doesn't interfere with hasAnyGrowth logic below.
  const hollarIndex = reservesList.findIndex(r => r.toLowerCase() === HOLLAR)
  if (hollarIndex >= 0) {
    const totalDebt = BigInt(reserveDataBefore[hollarIndex].totalVariableDebt)
    const borrowRate = BigInt(reserveDataBefore[hollarIndex].variableBorrowRate)
    if (totalDebt > 0 && borrowRate > 0) {
      const dailyInterest = totalDebt * borrowRate / BigInt(365) / LiquidityIndexDecimals
      const dailyInterestUSD = Number(dailyInterest) / 1e18
      dailyFees.addUSDValue(dailyInterestUSD, METRIC.BORROW_INTEREST)
      dailyProtocolRevenue.addUSDValue(dailyInterestUSD, 'Borrow Interest To Treasury')
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

      if (current && (current.totalAToken > 0 || current.totalVariableDebt > 0 || current.totalStableDebt > 0)) {
        if (reservesList[i].toLowerCase() === HOLLAR) continue // already handled above

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

  // Add protocol-only streams not captured by the liquidity index approach above
  const startTime = new Date(options.fromTimestamp * 1000).toISOString()
  const endTime = new Date(options.toTimestamp * 1000).toISOString()
  const extraAmounts = await Promise.all(
    EXTRA_PROTOCOL_STREAMS.map(({ productType, streamType }) =>
      fetchProtocolStream(productType, streamType, startTime, endTime)
    )
  )
  for (let i = 0; i < EXTRA_PROTOCOL_STREAMS.length; i++) {
    const { label, revenueLabel } = EXTRA_PROTOCOL_STREAMS[i]
    dailyFees.addUSDValue(extraAmounts[i], label)
    dailyProtocolRevenue.addUSDValue(extraAmounts[i], revenueLabel)
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
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.BORROW_INTEREST]: 'Interest paid by borrowers across all money market reserves.',
      [METRIC.LIQUIDATION_FEES]: "Treasury's 10% cut from money market liquidations.",
      'PEPL Liquidation Profit': 'Protocol revenue from PEPL (Peg Enforcement Protection Liquidation) liquidations.',
      'HSM Revenue': 'Hollar Stability Module arb profits and yield from yield-bearing stablecoins.',
    },
    ProtocolRevenue: {
      'Borrow Interest To Treasury': 'HOLLAR borrow interest — CDP stablecoin where 100% goes to Treasury.',
      'Liquidation Penalty To Treasury': "Treasury's 10% cut from money market liquidations.",
      'PEPL Liquidation Profit To Treasury': '100% of PEPL liquidation proceeds to Treasury.',
      'HSM Revenue To Treasury': 'Hollar Stability Module revenue to Treasury.',
    },
  },
}

export default adapter
