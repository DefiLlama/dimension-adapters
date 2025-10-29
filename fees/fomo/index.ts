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
    allFeePayments AS (
      SELECT
        tx_id,
        token_balance_change AS fee_token_amount,
        'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' AS fee_token_mint_address
      FROM
        solana.account_activity
      WHERE
        TIME_RANGE
        AND tx_success
        AND address = 'HrTf9CzXR1dRH4Sof5QrpmGWwpwAf3qZzwCsEjQpXcSq'
        AND token_balance_change > 0 
        AND token_mint_address = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
    )
    SELECT
      SUM(fee_token_amount) AS fee_usd
    FROM
      dex_solana.trades AS trades
      JOIN allFeePayments AS feePayments ON trades.tx_id = feePayments.tx_id
    WHERE
      TIME_RANGE
      AND trades.trader_id != 'R4rNJHaffSUotNmqSKNEfDcJE8A7zJUkaoM5Jkd7cYX'
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
