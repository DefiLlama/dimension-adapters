import { Adapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";
import request, { gql } from "graphql-request";

// GT Buyback Season 2: the GT that referrers sold for day D is confirmed at about 00:01 UTC on D+1 and paid at the GT minting cost of that moment
const getSeason2BuybackUSD = async (options: FetchOptions, url: string) => {
  const confirmFrom = new Date((options.startOfDay + 86400) * 1000).toISOString()
  const confirmTo = new Date((options.startOfDay + 2 * 86400) * 1000).toISOString()
  const { gtBuybacks } = await request(url, gql`
    {
      gtBuybacks(where: {timestamp_gte: "${confirmFrom}", timestamp_lt: "${confirmTo}"}, orderBy: timestamp_ASC, limit: 1) {
        timestamp
        buybackAmount
      }
    }
  `)
  if (!gtBuybacks.length) throw new Error(`gmx-sol: the GT buyback for ${options.dateString} is not confirmed yet`)
  const { gtGlobalHistories } = await request(url, gql`
    {
      gtGlobalHistories(where: {timestamp_lte: "${gtBuybacks[0].timestamp}"}, orderBy: timestamp_DESC, limit: 1) {
        mintingCost
      }
    }
  `)
  // buybackAmount is in GT base units and mintingCost is USD with 20 decimals per base unit, so their product / 1e20 is USD
  return Number(gtBuybacks[0].buybackAmount) * Number(gtGlobalHistories[0].mintingCost) / 1e20
}

const fetch = async (options: FetchOptions) => {
  const targetDate = new Date(options.startOfDay * 1000).toISOString();

  const feeStructureChangeDate = '2026-01-16' // 75% LPs / 25% treasury from this day
  // GT buyback, confirmed by the GMX team: from 2025-03-16 to 2026-01-15 the treasury put 60% of its share into a daily GT bank (36% of fees)
  // the two launch days were capped by GT deposits, so the team's actual buyback amounts are used; $192,192 bought back in total
  const gtBuybackLaunchDays: Record<string, number> = { '2025-03-14': 11349.96, '2025-03-15': 23522.82 }
  const gtBuybackStart = '2025-03-16'
  const gtBuybackEnd = '2026-01-15'
  // GT Buyback Season 2 (GMLabs-002), live from 2026-09-28 00:00 UTC for the duration of the season: 99% of fees to the treasury for the GT buyback, 1% to LPs
  // the squid's own tradeRevenue and swapRevenue show the same 99% share on every day since then
  // each day the treasury buys the GT that referrers sold, within their Season 2 quotas, at the GT minting cost and up to that 99%; the rest stays in the treasury
  const season2Start = '2026-09-28'
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
    else if (options.dateString < season2Start) {
      dailyRevenue.addUSDValue(record.tradeFees / 1e20 * 0.25, METRIC.TRADING_FEES)
      dailyRevenue.addUSDValue(record.swapFees / 1e20 * 0.25, METRIC.SWAP_FEES)
      dailySupplySideRevenue.addUSDValue(record.tradeFees / 1e20 * 0.75, METRIC.TRADING_FEES)
      dailySupplySideRevenue.addUSDValue(record.swapFees / 1e20 * 0.75, METRIC.SWAP_FEES)
      dailyProtocolRevenue.addUSDValue(totalFees * 0.25, METRIC.PROTOCOL_FEES)
    }
    else {
      const treasuryShare = totalFees * 0.99
      dailyRevenue.addUSDValue(record.tradeFees / 1e20 * 0.99, METRIC.TRADING_FEES)
      dailyRevenue.addUSDValue(record.swapFees / 1e20 * 0.99, METRIC.SWAP_FEES)
      dailySupplySideRevenue.addUSDValue(record.tradeFees / 1e20 * 0.01, METRIC.TRADING_FEES)
      dailySupplySideRevenue.addUSDValue(record.swapFees / 1e20 * 0.01, METRIC.SWAP_FEES)

      const buyback = Math.min(await getSeason2BuybackUSD(options, url), treasuryShare)
      dailyHoldersRevenue.addUSDValue(buyback, METRIC.TOKEN_BUY_BACK)
      dailyProtocolRevenue.addUSDValue(treasuryShare - buyback, METRIC.PROTOCOL_FEES)
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
    [METRIC.TRADING_FEES]: "99% of the trading fees go to the protocol since 28 September 2026 (GT Buyback Season 2), 25% from 16 January 2026, 70% before.",
    [METRIC.SWAP_FEES]: "99% of the swap fees go to the protocol since 28 September 2026 (GT Buyback Season 2), 25% from 16 January 2026, 70% before.",
  },
  ProtocolRevenue: {
    [METRIC.PROTOCOL_FEES]: "Protocol share of fees kept by the treasury: 70% before 14 March 2025, 70% minus the actual GT buyback on 14-15 March 2025, 34% from 16 March 2025 to 15 January 2026, 25% from 16 January 2026, and since 28 September 2026 (GT Buyback Season 2) the part of the 99% not used for the GT buyback.",
  },
  HoldersRevenue: {
    [METRIC.TOKEN_BUY_BACK]: "Daily GT buyback funded by the treasury: 36% of fees from 16 March 2025 to 15 January 2026, the actual capped amounts on the 14-15 March 2025 launch days, 0 from 16 January 2026, and since 28 September 2026 (GT Buyback Season 2) the GT sold to the treasury that day at the GT minting cost, capped at 99% of fees.",
  },
  SupplySideRevenue: {
    [METRIC.TRADING_FEES]: "1% of the trading fees go to liquidity providers since 28 September 2026 (GT Buyback Season 2), 75% from 16 January 2026, 30% before.",
    [METRIC.SWAP_FEES]: "1% of the swap fees go to liquidity providers since 28 September 2026 (GT Buyback Season 2), 75% from 16 January 2026, 30% before.",
  },
}

const methodology = {
  Fees: "Opening/closing fees for perpetual positions, swap fees, liquidation fees, and borrowing fees",
  Revenue: "99% of all collected fees since 28 September 2026 (GT Buyback Season 2), 25% from 16 January 2026, 70% before.",
  ProtocolRevenue: "Share of fees kept by the treasury after the GT buyback: 70% before 14 March 2025, 70% minus the actual GT buyback on 14-15 March 2025, 34% from 16 March 2025 to 15 January 2026, 25% from 16 January 2026, and since 28 September 2026 (GT Buyback Season 2) the part of the 99% not used for the GT buyback.",
  HoldersRevenue: "Daily GT buyback funded by the treasury: 36% of fees from 16 March 2025 to 15 January 2026 (actual amounts on the 14-15 March 2025 launch days), 0 before that and from 16 January 2026, and since 28 September 2026 (GT Buyback Season 2) the GT sold to the treasury that day at the GT minting cost, capped at 99% of fees. GT is GMTrade's own token, not GMX.",
  SupplySideRevenue: "1% of the fees go to liquidity providers since 28 September 2026 (GT Buyback Season 2), 75% from 16 January 2026, 30% before.",
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
