import ADDRESSES from '../helpers/coreAssets.json'
// source: https://ant.fun

import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryDuneSql } from "../helpers/dune";

const fetch: any = async (_a: any, _b: any, options: FetchOptions) => {
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
        AND address in (
          'DXoA7ESQY9jcSTkvqt3rzaDtdAhVp9gbAFPMrcrTFpoF',
          '4tbYi6gzbEyktazkQuexC5PZvga2NMwtjLVUcT3Cu1th',
          'G3atyMmJHhE7wY8Xer5c12tGD5ZBxPrzAWvAXa6vrba',
          'DL11UP6KeoSkXCN42fig9o4VMGhDFQhjmupDduwkXioU',
          'DBJrXX66XNXDiDuTqG9j1kGJ4z1spgZ4y8ATzi1pLmMs'
        )
        AND tx_success
        AND balance_change > 0
    ),
    botTrades AS (
      SELECT
        trades.tx_id,
        MAX(fee_token_amount) AS fee
      FROM
        dex_solana.trades AS trades
        JOIN allFeePayments AS feePayments ON trades.tx_id = feePayments.tx_id
      WHERE
        TIME_RANGE
        AND trades.trader_id not in (
          'DXoA7ESQY9jcSTkvqt3rzaDtdAhVp9gbAFPMrcrTFpoF',
          '4tbYi6gzbEyktazkQuexC5PZvga2NMwtjLVUcT3Cu1th',
          'G3atyMmJHhE7wY8Xer5c12tGD5ZBxPrzAWvAXa6vrba',
          'DL11UP6KeoSkXCN42fig9o4VMGhDFQhjmupDduwkXioU',
          'DBJrXX66XNXDiDuTqG9j1kGJ4z1spgZ4y8ATzi1pLmMs'
        )
      GROUP BY trades.tx_id
    )
    SELECT
      SUM(fee) AS fee
    FROM
      botTrades
  `;

  const fees = await queryDuneSql(options, query);
  const feeAmount = fees && fees.length > 0 && fees[0].fee ? fees[0].fee : 0;
  dailyFees.add(ADDRESSES.solana.SOL, feeAmount);

  return { dailyFees, dailyRevenue: dailyFees, }
}

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.SOLANA],
  start: '2025-07-01',
  isExpensiveAdapter: true,
  dependencies: [Dependencies.DUNE],
  methodology: {
    Fees: "All trading fees paid by users while using ant.fun trading bot.",
    Revenue: "Trading fees are collected by ant.fun protocol."
  }
};

export default adapter;
