import ADDRESSES from '../../helpers/coreAssets.json'
// source: https://dune.com/queries/4962800/8212075

import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";

const fetch: any = async (_a: any, _b: any, options: FetchOptions) => {
  const dailyFees = options.createBalances();

  const query = `
    WITH
    allFeePayments AS (
      SELECT
        tx_id,
        balance_change / 1e9 AS fee_token_amount
      FROM
        solana.account_activity
      WHERE
        TIME_RANGE
        AND tx_success
        AND address IN (
          'F34kcgMgCF7mYWkwLN3WN7KrFprr2NbwxuLvXx4fbztj',
          'K1LRSA1DSoKBtC5DkcvnermRQ62YxogWSCZZPWQrdG5',
          'HEPL5rTb6n1Ax6jt9z2XMPFJcDe9bSWvWQpsK7AMcbZg',
          '96aFQc9qyqpjMfqdUeurZVYRrrwPJG2uPV6pceu4B1yb',
          'BTQyUXhxiLrFPD5JUANCwg4ViibmNY39McmWk4bVNxLA',
          '4vfFG2xGZsjXQgA6ZCTzA1PgUGLppFHY9eGnh3ZVGUuz',
          'A7XTexV13EPnhtH55qhT7qmFkgYCMAMnfXk89VWu9PCJ',
          'GreGavLfh5sK1BeQ2WYvmk352wbyNNzQdCmqWCV8QSib'
        )
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
        AND trades.trader_id NOT IN (
          'F34kcgMgCF7mYWkwLN3WN7KrFprr2NbwxuLvXx4fbztj',
          'K1LRSA1DSoKBtC5DkcvnermRQ62YxogWSCZZPWQrdG5',
          'HEPL5rTb6n1Ax6jt9z2XMPFJcDe9bSWvWQpsK7AMcbZg',
          '96aFQc9qyqpjMfqdUeurZVYRrrwPJG2uPV6pceu4B1yb',
          'BTQyUXhxiLrFPD5JUANCwg4ViibmNY39McmWk4bVNxLA',
          '4vfFG2xGZsjXQgA6ZCTzA1PgUGLppFHY9eGnh3ZVGUuz',
          'A7XTexV13EPnhtH55qhT7qmFkgYCMAMnfXk89VWu9PCJ',
          'GreGavLfh5sK1BeQ2WYvmk352wbyNNzQdCmqWCV8QSib'
        )
      GROUP BY trades.tx_id
    )
    SELECT
      SUM(fee) AS fee
    FROM
      botTrades
  `;

  const fees = await queryDuneSql(options, query);
  dailyFees.add(ADDRESSES.solana.SOL, fees[0].fee * 1e9);

  return { dailyFees, dailyRevenue: dailyFees, }
}

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.SOLANA],
  dependencies: [Dependencies.DUNE],
  start: '2025-08-15',
  isExpensiveAdapter: true
};

export default adapter;
