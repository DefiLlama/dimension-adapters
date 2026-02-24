import ADDRESSES from '../helpers/coreAssets.json'
// source: https://dune.com/adam_tehc/moonshotmoney
// https://dune.com/queries/3939570/6625988

import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryDuneSql } from "../helpers/dune";

const fetch: any = async (_a: any, _b: any, options: FetchOptions) => {
  const dailyFees = options.createBalances();

  const query = `
    WITH
    allFeePayments AS (
      SELECT DISTINCT
        tx_id,
        amount AS fee_token_amount,  
        token_mint_address
      FROM
        tokens_solana.transfers
      WHERE
        block_time >= TIMESTAMP '2024-07-08'
        AND TIME_RANGE
        AND to_owner = '5wkyL2FLEcyUUgc3UeGntHTAfWfzDrVuxMnaMm7792Gk'
        AND token_mint_address = '${ADDRESSES.solana.USDC}'

      UNION ALL
      
      SELECT DISTINCT
        tx_id,
        balance_change AS fee_token_amount,
        '${ADDRESSES.solana.SOL}' AS token_mint_address
      FROM
        solana.account_activity
      WHERE
        TIME_RANGE
        AND block_time >= TIMESTAMP '2024-05-14'
        AND address = '5wkyL2FLEcyUUgc3UeGntHTAfWfzDrVuxMnaMm7792Gk'
        AND balance_change > 0 
        AND tx_success
    )
    SELECT
      feePayments.token_mint_address,
      SUM(feePayments.fee_token_amount) AS total_fees
    FROM
      dex_solana.trades AS trades
      JOIN allFeePayments AS feePayments ON trades.tx_id = feePayments.tx_id
    WHERE
      TIME_RANGE
      AND trades.trader_id != '5wkyL2FLEcyUUgc3UeGntHTAfWfzDrVuxMnaMm7792Gk'
    GROUP BY
      feePayments.token_mint_address
  `;

  const fees = await queryDuneSql(options, query);

  fees.forEach((row: any) => {
    dailyFees.add(row.token_mint_address, row.total_fees);
  });

  return { dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees }
}

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.SOLANA],
  start: '2024-05-14',
  dependencies: [Dependencies.DUNE],
  isExpensiveAdapter: true,
  methodology: {
    Fees: 'All buy/sell fees paid by users for using Moonshot App.',
    Revenue: 'All fees are collected by Moonshot App.',
    ProtocolRevenue: 'All fees are collected by Moonshot App.',
  }
};

export default adapter;
