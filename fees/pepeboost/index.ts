import ADDRESSES from '../../helpers/coreAssets.json'
// source: https://dune.com/queries/4022970/6772481

import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";

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
        AND address = 'G9PhF9C9H83mAjjkdJz4MDqkufiTPMJkx7TnKE1kFyCp'
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
      AND trades.trader_id != 'G9PhF9C9H83mAjjkdJz4MDqkufiTPMJkx7TnKE1kFyCp'
  `;

  const fees = await queryDuneSql(options, query);
  dailyFees.add(ADDRESSES.solana.SOL, fees[0].fee);

  return { dailyFees, dailyRevenue: dailyFees, }
}

const adapter: SimpleAdapter = {
  version: 1,
  adapter: {
    [CHAIN.SOLANA]: {
      fetch: fetch,
      start: '2024-01-06',
      meta: {
        methodology: {
          Fees: "Trading fees paid by users while using PepeBoost bot.",
          Revenue: "All fees are collected by PepeBoost protocol.",
        }
      }
    },
  },
  isExpensiveAdapter: true
};

export default adapter;
