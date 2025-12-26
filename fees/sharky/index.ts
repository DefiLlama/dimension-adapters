import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDune } from "../../helpers/dune";

interface IDuneResult {
  timestamp: number;
  daily_revenue: number;
}

/**
 * Dune Query ID: 6421240
 * URL: https://dune.com/queries/6421240
 * 
 * Query:
 * WITH fees_tx AS (
 *   SELECT
 *     DATE_TRUNC('day', a.block_time) AS day,
 *     SUM(a.balance_change) / 1e9 AS sol_balance,
 *     SUM(a.balance_change / 1e9 * p.price) AS usdc_balance
 *   FROM solana.account_activity AS a
 *   LEFT JOIN prices.usd AS p
 *     ON p.minute = DATE_TRUNC('minute', a.block_time)
 *     AND p.blockchain = 'solana'
 *     AND p.symbol = 'SOL'
 *   WHERE       
 *     a.address = 'feegKBq3GAfqs9G6muPjdn8xEEZhALLTr2xsigDyxnV'
 *     AND a.tx_success
 *     AND a.balance_change > 0
 *   GROUP BY 1
 * )
 * SELECT
 *   TRY_CAST(TO_UNIXTIME(day) AS INTEGER) AS timestamp,
 *   SUM(usdc_balance) AS daily_revenue
 * FROM fees_tx
 * GROUP BY day
 * ORDER BY day DESC
 */

const fetch = async (options: FetchOptions) => {
  const { startTimestamp, endTimestamp } = options;
  const duneData: IDuneResult[] = await queryDune("6421240");

  const dailyFees = options.createBalances();
  
  // Filter for the specific day being queried
  // startTimestamp and endTimestamp define the 24-hour period
  duneData.forEach((item: IDuneResult) => {
    // Only include data within the requested time range
    if (item.timestamp >= startTimestamp && item.timestamp < endTimestamp && item.daily_revenue) {
      dailyFees.addUSDValue(item.daily_revenue);
    }
  });

  return {
    dailyFees,
    dailyRevenue: dailyFees,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.SOLANA]: {
      fetch,
      start: 1704067200, // January 1, 2024
    },
  },
  methodology: {
    Fees: "Tracks SOL balance changes to the protocol fee address (feegKBq3GAfqs9G6muPjdn8xEEZhALLTr2xsigDyxnV) and converts to USD using historical SOL prices",
    Revenue: "All fees collected are considered protocol revenue",
  },
};

export default adapter;