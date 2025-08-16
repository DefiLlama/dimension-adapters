import ADDRESSES from '../../helpers/coreAssets.json'
// source: https://dune.com/adam_tehc/nova
// https://dune.com/queries/4966625/8220176

import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";

const fetch = async (_: any, _1: any, options: FetchOptions) => {
  const dailyFees = options.createBalances();

  const query = `
    WITH
    allFeePayments AS (
      SELECT
        tx_id,
        balance_change AS fee_token_amount
      FROM
        solana.account_activity
      WHERE
        TIME_RANGE
        AND address = 'noVakKQGTTjpHARvecAUbVnc85AatCLm3ijDFk8JXZB'
        AND tx_success
        AND balance_change > 0 
    )
    SELECT
      SUM(fee_token_amount) AS fee
    FROM
      dex_solana.trades AS trades
      JOIN allFeePayments AS feePayments ON trades.tx_id = feePayments.tx_id
    WHERE
      TIME_RANGE
      AND trades.trader_id != 'noVakKQGTTjpHARvecAUbVnc85AatCLm3ijDFk8JXZB'
  `;

  const fees = await queryDuneSql(options, query);
  dailyFees.add(ADDRESSES.solana.SOL, fees[0].fee);

  return { dailyFees, dailyRevenue: dailyFees }
}

const adapter: SimpleAdapter = {
  methodology: {
    Fees: "Trading fees paid by users while using Nova bot.",
    Revenue: "All fees are collected by Nova protocol.",
  },
  version: 1,
  adapter: {
    [CHAIN.SOLANA]: {
      fetch,
      start: '2025-05-21',
    },
  },
  isExpensiveAdapter: true
};

export default adapter;
