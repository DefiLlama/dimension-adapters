import { Adapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";
import request, { gql } from "graphql-request";


const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const targetDate = new Date(options.startOfDay * 1000).toISOString();

  const feeStructureChangeTimestamp = 1768521600 // 2026-01-16
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
  // const dailyHoldersRevenue = options.createBalances()

  for (const record of res.feesRecordDailies) {
    dailyFees.addUSDValue(record.tradeFees / 1e20, METRIC.TRADING_FEES)
    dailyFees.addUSDValue(record.swapFees / 1e20, METRIC.SWAP_FEES)

    if (options.fromTimestamp < feeStructureChangeTimestamp) {
      dailyRevenue.addUSDValue(record.tradeFees / 1e20 * 0.7, METRIC.TRADING_FEES)
      dailyRevenue.addUSDValue(record.swapFees / 1e20 * 0.7, METRIC.SWAP_FEES)
      dailySupplySideRevenue.addUSDValue(record.tradeFees / 1e20 * 0.3, METRIC.TRADING_FEES)
      dailySupplySideRevenue.addUSDValue(record.swapFees / 1e20 * 0.3, METRIC.SWAP_FEES)
      // dailyHoldersRevenue.addUSDValue(record.tradeFees / 1e20 * 0.27, METRIC.TRADING_FEES)
      // dailyHoldersRevenue.addUSDValue(record.swapFees / 1e20 * 0.27, METRIC.SWAP_FEES)
    }
    else {
      dailyRevenue.addUSDValue(record.tradeFees / 1e20 * 0.25, METRIC.TRADING_FEES)
      dailyRevenue.addUSDValue(record.swapFees / 1e20 * 0.25, METRIC.SWAP_FEES)
      dailySupplySideRevenue.addUSDValue(record.tradeFees / 1e20 * 0.75, METRIC.TRADING_FEES)
      dailySupplySideRevenue.addUSDValue(record.swapFees / 1e20 * 0.75, METRIC.SWAP_FEES)
    }
  }

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    // dailyHoldersRevenue,
    dailySupplySideRevenue,
  }
}

const breakdownMethodology = {
  Fees: {
    [METRIC.TRADING_FEES]: "Fees from opening/closing perpetual positions + borrowing fees + liquidation fees",
    [METRIC.SWAP_FEES]: "Fees from swap fees",
  },
  Revenue: {
    [METRIC.TRADING_FEES]: "25% of the trading fees go to the protocol.",
    [METRIC.SWAP_FEES]: "25% of the swap fees go to the protocol.",
  },
  ProtocolRevenue: {
    [METRIC.TRADING_FEES]: "25% of the trading fees go to the protocol.",
    [METRIC.SWAP_FEES]: "25% of the swap fees go to the protocol.",
  },
  SupplySideRevenue: {
    [METRIC.TRADING_FEES]: "75% of the trading fees go to the supply side.",
    [METRIC.SWAP_FEES]: "75% of the swap fees go to the supply side.",
  },
}

const methodology = {
  Fees: "Opening/closing fees for perpetual positions, swap fees, liquidation fees, and borrowing fees",
  Revenue: "25% of all collected fees",
  ProtocolRevenue: "25% of the fees go to the protocol.",
  SupplySideRevenue: "75% of the fees go to the supply side.",
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
