import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const query = `
    WITH fees_tx AS (
      SELECT
        DATE_TRUNC('day', a.block_time) AS day,
        SUM(a.balance_change) / 1e9 AS sol_balance,
        SUM(a.balance_change / 1e9 * p.price) AS usdc_balance
      FROM solana.account_activity AS a
      LEFT JOIN prices.usd AS p
        ON p.minute = DATE_TRUNC('minute', a.block_time)
        AND p.blockchain = 'solana'
        AND p.symbol = 'SOL'
      WHERE       
        a.address = 'feegKBq3GAfqs9G6muPjdn8xEEZhALLTr2xsigDyxnV'
        AND a.tx_success
        AND a.balance_change > 0
        AND a.block_time >= from_unixtime(${options.startTimestamp})
        AND a.block_time < from_unixtime(${options.endTimestamp})
      GROUP BY 1
    )
    SELECT
      SUM(usdc_balance) AS daily_revenue
    FROM fees_tx
  `;

  const data = await queryDuneSql(options, query);
  
  return {
    dailyFees: Number(data[0].daily_revenue) || 0,
    dailyRevenue: Number(data[0].daily_revenue) || 0,
  };
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.SOLANA],
  dependencies: [Dependencies.DUNE],
  isExpensiveAdapter: true,
  start: '2024-01-01',
};

export default adapter;