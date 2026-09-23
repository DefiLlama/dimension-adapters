import { Adapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";
import request, { gql } from "graphql-request";


const fetch = async (options: FetchOptions) => {
  const targetDate = new Date(options.startOfDay * 1000).toISOString();

  const feeStructureChangeDate = '2026-01-16' // 75% LPs / 25% treasury from this day
  // GT buyback, confirmed by the GMX team: from 2025-03-16 to 2026-01-15 the treasury put 60% of its share into a daily GT bank (36% of fees)
  // the two launch days were capped by GT deposits, so the team's actual buyback amounts are used; $192,192 bought back in total
  const gtBuybackLaunchDays: Record<string, number> = { '2025-03-14': 11349.96, '2025-03-15': 23522.82 }
  const gtBuybackStart = '2025-03-16'
  const gtBuybackEnd = '2026-01-15'
  const query = gql`
    {
       feesRecordDailies(where: {timestamp_eq: "${targetDate}"}) {
        tradeFees
        swapFees
      }
    }
  `
  const url = "https://gmx-solana-sqd.squids.live/gmx-solana-base:prod/api/graphql"
  const res = await request(url, query)

  const dailyFees = options.createBalances()
  const dailyRevenue = options.createBalances()
  const dailySupplySideRevenue = options.createBalances()
  const dailyProtocolRevenue = options.createBalances()
  const dailyHoldersRevenue = options.createBalances()

  for (const record of res.feesRecordDailies) {
    // squid fee fields are USD with 20 decimals
    const totalFees = (Number(record.tradeFees) + Number(record.swapFees)) / 1e20
    dailyFees.addUSDValue(record.tradeFees / 1e20, METRIC.TRADING_FEES)
    dailyFees.addUSDValue(record.swapFees / 1e20, METRIC.SWAP_FEES)

    if (options.dateString < feeStructureChangeDate) {
      dailyRevenue.addUSDValue(record.tradeFees / 1e20 * 0.7, METRIC.TRADING_FEES)
      dailyRevenue.addUSDValue(record.swapFees / 1e20 * 0.7, METRIC.SWAP_FEES)
      dailySupplySideRevenue.addUSDValue(record.tradeFees / 1e20 * 0.3, METRIC.TRADING_FEES)
      dailySupplySideRevenue.addUSDValue(record.swapFees / 1e20 * 0.3, METRIC.SWAP_FEES)

      if (gtBuybackLaunchDays[options.dateString] !== undefined) {
        const buyback = gtBuybackLaunchDays[options.dateString]
        dailyHoldersRevenue.addUSDValue(buyback, METRIC.TOKEN_BUY_BACK)
        dailyProtocolRevenue.addUSDValue(totalFees * 0.7 - buyback, METRIC.PROTOCOL_FEES)
      } else if (options.dateString >= gtBuybackStart && options.dateString <= gtBuybackEnd) {
        dailyHoldersRevenue.addUSDValue(totalFees * 0.36, METRIC.TOKEN_BUY_BACK)
        dailyProtocolRevenue.addUSDValue(totalFees * 0.34, METRIC.PROTOCOL_FEES)
      } else {
        dailyProtocolRevenue.addUSDValue(totalFees * 0.7, METRIC.PROTOCOL_FEES)
      }
    }
    else {
      dailyRevenue.addUSDValue(record.tradeFees / 1e20 * 0.25, METRIC.TRADING_FEES)
      dailyRevenue.addUSDValue(record.swapFees / 1e20 * 0.25, METRIC.SWAP_FEES)
      dailySupplySideRevenue.addUSDValue(record.tradeFees / 1e20 * 0.75, METRIC.TRADING_FEES)
      dailySupplySideRevenue.addUSDValue(record.swapFees / 1e20 * 0.75, METRIC.SWAP_FEES)
      dailyProtocolRevenue.addUSDValue(totalFees * 0.25, METRIC.PROTOCOL_FEES)
    }
  }

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailyHoldersRevenue,
    dailySupplySideRevenue,
  }
}

const breakdownMethodology = {
  Fees: {
    [METRIC.TRADING_FEES]: "Fees from opening/closing perpetual positions + borrowing fees + liquidation fees",
    [METRIC.SWAP_FEES]: "Fees from swap fees",
  },
  Revenue: {
    [METRIC.TRADING_FEES]: "25% of the trading fees go to the protocol since 16 January 2026, 70% before.",
    [METRIC.SWAP_FEES]: "25% of the swap fees go to the protocol since 16 January 2026, 70% before.",
  },
  ProtocolRevenue: {
    [METRIC.PROTOCOL_FEES]: "Protocol share of fees kept by the treasury: 70% before 14 March 2025, 70% minus the actual GT buyback on 14-15 March 2025, 34% from 16 March 2025 to 15 January 2026, and 25% since 16 January 2026.",
  },
  HoldersRevenue: {
    [METRIC.TOKEN_BUY_BACK]: "Daily GT buyback funded by the treasury: 36% of fees from 16 March 2025 to 15 January 2026, the actual capped amounts on the 14-15 March 2025 launch days, and 0 outside that period.",
  },
  SupplySideRevenue: {
    [METRIC.TRADING_FEES]: "75% of the trading fees go to liquidity providers since 16 January 2026, 30% before.",
    [METRIC.SWAP_FEES]: "75% of the swap fees go to liquidity providers since 16 January 2026, 30% before.",
  },
}

const methodology = {
  Fees: "Opening/closing fees for perpetual positions, swap fees, liquidation fees, and borrowing fees",
  Revenue: "25% of all collected fees since 16 January 2026, 70% before.",
  ProtocolRevenue: "Share of fees kept by the treasury after the GT buyback: 70% before 14 March 2025, 70% minus the actual GT buyback on 14-15 March 2025, 34% from 16 March 2025 to 15 January 2026, and 25% since 16 January 2026.",
  HoldersRevenue: "Daily GT buyback funded by the treasury: 36% of fees from 16 March 2025 to 15 January 2026 (actual amounts on the 14-15 March 2025 launch days), 0 before and since 16 January 2026. GT is GMTrade's own token, not GMX.",
  SupplySideRevenue: "75% of the fees go to liquidity providers since 16 January 2026, 30% before.",
}

const adapter: Adapter = {
  version: 1,
  fetch,
  chains: [CHAIN.SOLANA],
  start: '2025-02-12',
  methodology,
  breakdownMethodology,
};

export default adapter;
