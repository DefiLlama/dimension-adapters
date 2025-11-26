import ADDRESSES from '../helpers/coreAssets.json'
// source: https://ant.fun

import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryDuneSql } from "../helpers/dune";

const fetch: any = async (_a: any, _b: any, options: FetchOptions) => {
  const dailyFees = options.createBalances();

  const FEE_ADDRESSES = [
    'DXoA7ESQY9jcSTkvqt3rzaDtdAhVp9gbAFPMrcrTFpoF',
    '4tbYi6gzbEyktazkQuexC5PZvga2NMwtjLVUcT3Cu1th',
    'G3atyMmJHhE7wY8Xer5c12tGD5ZBxPrzAWvAXa6vrba',
    'DL11UP6KeoSkXCN42fig9o4VMGhDFQhjmupDduwkXioU',
    'DBJrXX66XNXDiDuTqG9j1kGJ4z1spgZ4y8ATzi1pLmMs'
  ];

  const feeAddressesList = FEE_ADDRESSES.map(addr => `'${addr}'`).join(', ');

  const query = `
    WITH
    allFeePayments AS (
      -- USDC fees from token transfers
      SELECT DISTINCT
        tx_id,
        amount AS fee_token_amount,
        '${ADDRESSES.solana.USDC}' AS token_mint_address
      FROM
        tokens_solana.transfers
      WHERE
        TIME_RANGE
        AND to_owner IN (${feeAddressesList})
        AND token_mint_address = '${ADDRESSES.solana.USDC}'
        AND amount > 0

      UNION ALL

      -- USDT fees from token transfers
      SELECT DISTINCT
        tx_id,
        amount AS fee_token_amount,
        '${ADDRESSES.solana.USDT}' AS token_mint_address
      FROM
        tokens_solana.transfers
      WHERE
        TIME_RANGE
        AND to_owner IN (${feeAddressesList})
        AND token_mint_address = '${ADDRESSES.solana.USDT}'
        AND amount > 0

      UNION ALL

      -- SOL fees from account activity (if any)
      SELECT DISTINCT
        tx_id,
        balance_change AS fee_token_amount,
        '${ADDRESSES.solana.SOL}' AS token_mint_address
      FROM
        solana.account_activity
      WHERE
        TIME_RANGE
        AND address IN (${feeAddressesList})
        AND tx_success
        AND balance_change > 0
    ),
    botTrades AS (
      SELECT
        trades.tx_id,
        feePayments.token_mint_address,
        MAX(feePayments.fee_token_amount) AS fee
      FROM
        dex_solana.trades AS trades
        JOIN allFeePayments AS feePayments ON trades.tx_id = feePayments.tx_id
      WHERE
        TIME_RANGE
        AND trades.trader_id NOT IN (${feeAddressesList})
      GROUP BY trades.tx_id, feePayments.token_mint_address
    )
    SELECT
      token_mint_address,
      SUM(fee) AS total_fees
    FROM
      botTrades
    GROUP BY token_mint_address
  `;

  const fees = await queryDuneSql(options, query);
  
  fees.forEach((row: any) => {
    if (row.token_mint_address && row.total_fees) {
      dailyFees.add(row.token_mint_address, row.total_fees);
    }
  });

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
