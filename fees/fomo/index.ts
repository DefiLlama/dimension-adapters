import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";
import { getSolanaReceived } from "../../helpers/token";
import { METRIC } from "../../helpers/metrics";

const dataAvaliableTill = (Date.now() / 1e3 - 10 * 3600) // 10 hours ago

const fetch = async (_: any, _1: any, options: FetchOptions) => {
  if (options.endTimestamp > dataAvaliableTill) 
    throw new Error("Data not available till 10 hours ago. Please try a date before: " + new Date(dataAvaliableTill * 1e3).toISOString());

  const feesReceived = await getSolanaReceived({ 
    options, 
    target: 'R4rNJHaffSUotNmqSKNEfDcJE8A7zJUkaoM5Jkd7cYX',
    mints: ['EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v']
  })
  const dailyFees = options.createBalances();
  dailyFees.addBalances(feesReceived, METRIC.TRADING_FEES);

  const query = `
    WITH
    -- Off-chain relay fees (deduplicated)
    offchain_ranked AS (
      SELECT
        platform_fees + referral_fees AS fee_usd,
        ROW_NUMBER() OVER (PARTITION BY fee_period ORDER BY synced_at DESC) AS rn
      FROM dune.tryfomo.fomo_relay_fees
      WHERE fee_period >= from_unixtime(${options.startTimestamp})
        AND fee_period < from_unixtime(${options.endTimestamp})
    ),

    offchain_total AS (
      SELECT SUM(fee_usd) AS fee_usd
      FROM offchain_ranked
      WHERE rn = 1
    )

    SELECT
      COALESCE(offchain_total.fee_usd, 0) AS fee_usd
    FROM offchain_total
  `;

  const fees = await queryDuneSql(options, query);
  dailyFees.addUSDValue(Number(fees[0].fee_usd), METRIC.TRADING_FEES);

  return { dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees }
}

const breakdownMethodology = {
  Fees: {
    [METRIC.TRADING_FEES]: "Trading fees paid by users while using fomo app.",
  },
}

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.SOLANA],
  dependencies: [Dependencies.DUNE, Dependencies.ALLIUM],
  start: '2025-01-28',
  isExpensiveAdapter: true,
  methodology: {
    Fees: "Trading fees paid by users while using fomo app.",
    Revenue: "All fees are collected by fomo app.",
    ProtocolRevenue: "All fees are collected by fomo app.",
  },
  breakdownMethodology
};

export default adapter;