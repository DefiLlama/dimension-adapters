import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryDuneSql } from "../helpers/dune";

const fetch: any = async (_a: any, _b: any, options: FetchOptions) => {
  const fees = await queryDuneSql(options, `
    WITH
    allFeePayments AS (
      SELECT
        tx_id,
        'SOL' AS feeTokenType,
        balance_change / 1e9 AS fee_token_amount,
        'So11111111111111111111111111111111111111112' AS fee_token_mint_address 
      FROM
        solana.account_activity
      WHERE
        tx_success
        AND address = 'BB5dnY55FXS1e1NXqZDwCzgdYJdMCj3B92PU6Q5Fb6DT' 
        AND balance_change > 0 
        AND TIME_RANGE
  )
  SELECT
    SUM(fee_token_amount) AS fee
  FROM
    dex_solana.trades AS trades
    JOIN allFeePayments AS feePayments ON trades.tx_id = feePayments.tx_id
  WHERE
    trades.trader_id != 'BB5dnY55FXS1e1NXqZDwCzgdYJdMCj3B92PU6Q5Fb6DT'
    AND TIME_RANGE
  `);
  const dailyFees = options.createBalances()
  dailyFees.add('So11111111111111111111111111111111111111112', fees[0].fee*1e9);
  return { dailyFees, dailyRevenue: dailyFees, }
}

const adapter: SimpleAdapter = {
  version: 1,
  adapter: {
    [CHAIN.SOLANA]: {
      fetch: fetch,
      start: '2024-03-20'
    },
  },
  isExpensiveAdapter: true
};

export default adapter;