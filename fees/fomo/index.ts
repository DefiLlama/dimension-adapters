// source: https://dune.com/queries/5673933/9216113

import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";
const dataAvaliableTill = (Date.now() / 1e3 - 10 * 3600) // 10 hours ago

const fetch = async (_: any, _1: any, options: FetchOptions) => {
  if (options.endTimestamp > dataAvaliableTill) 
    throw new Error("Data not available till 10 hours ago. Please try a date before: " + new Date(dataAvaliableTill * 1e3).toISOString());

  const dailyFees = options.createBalances();

  const query = `
    WITH
    -- On-chain fee payments to the fee wallet
    onchain_fee_payments AS (
      SELECT
        tx_id,
        block_time,
        token_balance_change AS fee_token_amount
      FROM solana.account_activity
      WHERE
        tx_success
        AND address = 'HrTf9CzXR1dRH4Sof5QrpmGWwpwAf3qZzwCsEjQpXcSq'
        AND token_balance_change > 0 
        AND token_mint_address = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
    ),

    -- Filter to only bot trades (exclude market maker)
    onchain_bot_fees AS (
      SELECT 
        DATE(trades.block_time) AS fee_date,
        trades.tx_id,
        MAX(fee_token_amount) AS fee
      FROM dex_solana.trades AS trades
      JOIN onchain_fee_payments AS fp ON trades.tx_id = fp.tx_id
      WHERE
        trades.trader_id != 'R4rNJHaffSUotNmqSKNEfDcJE8A7zJUkaoM5Jkd7cYX'
      GROUP BY DATE(trades.block_time), trades.tx_id
    ),

    -- Aggregate on-chain fees by day
    onchain_daily AS (
      SELECT
        fee_date,
        SUM(fee) AS fee_usd
      FROM onchain_bot_fees
      GROUP BY fee_date
    ),

    -- Off-chain relay fees (deduplicated)
    offchain_ranked AS (
      SELECT
        CAST(fee_period AS DATE) AS fee_date,
        platform_fees + referral_fees AS fee_usd,
        ROW_NUMBER() OVER (PARTITION BY fee_period ORDER BY synced_at DESC) AS rn
      FROM dune.tryfomo.fomo_relay_fees
    ),

    offchain_daily AS (
      SELECT fee_date, fee_usd
      FROM offchain_ranked
      WHERE rn = 1
    ),

    -- Combine both sources
    combined AS (
      SELECT fee_date, fee_usd FROM onchain_daily
      UNION ALL
      SELECT fee_date, fee_usd FROM offchain_daily
    )

    SELECT
      fee_date,
      SUM(fee_usd) AS fee_usd
    FROM (
      SELECT
        fee_date,
        fee_usd,
        MAX(fee_date) OVER () AS max_fee_date
      FROM combined
    )
    WHERE fee_date < max_fee_date
    GROUP BY fee_date
    ORDER BY fee_date DESC
  `;

  const fees = await queryDuneSql(options, query);
  dailyFees.addUSDValue(Number(fees[0].fee_usd));

  return { dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees }
}

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.SOLANA],
  dependencies: [Dependencies.DUNE],
  start: '2025-01-28',
  isExpensiveAdapter: true,
  methodology: {
    Fees: "Trading fees paid by users while using fomo app.",
    Revenue: "All fees are collected by fomo app.",
    ProtocolRevenue: "All fees are collected by fomo app.",
  },
};

export default adapter;
