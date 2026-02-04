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
        AND block_time >= from_unixtime(${options.startTimestamp})
        AND block_time < from_unixtime(${options.endTimestamp})
        AND address = 'HrTf9CzXR1dRH4Sof5QrpmGWwpwAf3qZzwCsEjQpXcSq'
        AND token_balance_change > 0 
        AND token_mint_address = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
    ),

    -- Filter to only bot trades (exclude market maker)
    onchain_bot_fees AS (
      SELECT 
        trades.tx_id,
        MAX(fee_token_amount) AS fee
      FROM dex_solana.trades AS trades
      JOIN onchain_fee_payments AS fp ON trades.tx_id = fp.tx_id
      WHERE
        trades.trader_id != 'R4rNJHaffSUotNmqSKNEfDcJE8A7zJUkaoM5Jkd7cYX'
      GROUP BY trades.tx_id
    ),

    -- Aggregate on-chain fees
    onchain_total AS (
      SELECT
        SUM(fee) AS fee_usd
      FROM onchain_bot_fees
    ),

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
      COALESCE(onchain_total.fee_usd, 0) + COALESCE(offchain_total.fee_usd, 0) AS fee_usd
    FROM onchain_total
    CROSS JOIN offchain_total
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