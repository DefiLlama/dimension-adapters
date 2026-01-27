import { Adapter, Dependencies, FetchOptions, FetchResult } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryDuneSql } from "../helpers/dune";

const dailyStatsQuery = `
WITH daily_payments AS (
    SELECT 
        DATE(block_time) as payment_date,
        COUNT(*) as payment_count,
        SUM(varbinary_to_uint256(bytearray_substring(data, 1, 32))) as daily_received
    FROM opbnb.logs
    WHERE 
        contract_address = 0xEe83640f0ed07d36E799531CC6d87FB4CDcCaC13
        AND topic0 = 0x32aced27dfd49efcd31ceb0567a1ef533d2ab1481334c3f316047bf16fe1c8e8
        AND topic3 = 0x0000000000000000000000009e5aac1ba1a2e6aed6b32689dfcf62a509ca96f3
    GROUP BY DATE(block_time)
),
daily_withdrawals AS (
    SELECT 
        DATE(block_time) as withdrawal_date,
        COUNT(*) as withdrawal_count,
        SUM(varbinary_to_uint256(bytearray_substring(data, 1, 32))) as daily_withdrawn
    FROM opbnb.logs
    WHERE 
        contract_address = 0xEe83640f0ed07d36E799531CC6d87FB4CDcCaC13
        AND topic0 = 0x8210728e7c071f615b840ee026032693858fbcd5e5359e67e438c890f59e5620
        AND topic2 = 0x0000000000000000000000009e5aac1ba1a2e6aed6b32689dfcf62a509ca96f3
    GROUP BY DATE(block_time)
)
SELECT 
    COALESCE(dp.payment_date, dw.withdrawal_date) as date,
    
    COALESCE(dp.daily_received, 0) / 1e18 as daily_received_usdt,
    COALESCE(dw.daily_withdrawn, 0) / 1e18 as daily_withdrawn_usdt,
    (COALESCE(dp.daily_received, 0) - COALESCE(dw.daily_withdrawn, 0)) / 1e18 as daily_net_usdt,
    
    COALESCE(dp.payment_count, 0) as payment_count,
    COALESCE(dw.withdrawal_count, 0) as withdrawal_count
FROM daily_payments dp
FULL OUTER JOIN daily_withdrawals dw ON dp.payment_date = dw.withdrawal_date
ORDER BY date DESC
`;

const fetch = async (_timestamp: number, _: any, options: FetchOptions): Promise<FetchResult> => {
  const preFetchedResults = options.preFetchedResults;
  const dailyStats = preFetchedResults.dailyStats || [];

  // Dune dates are usually strings like "2023-01-01 00:00:00"
  const dayStr = new Date(options.startOfDay * 1000).toISOString().split('T')[0];

  const dailyStatRow = dailyStats.find((row: any) => {
    // handle potential date format differences
    const rowDate = row.date ? row.date.toString().split('T')[0] : "";
    return rowDate === dayStr;
  });

  const dailyRevenue = dailyStatRow ? dailyStatRow.daily_net_usdt : undefined;
  // Volume usually refers to the total amount processed, which here would be the received amount
  const dailyVolume = dailyStatRow ? dailyStatRow.daily_received_usdt : undefined;
  
  return {
    dailyFees: dailyRevenue, // Assuming fees = revenue for this protocol based on description
    dailyRevenue: dailyRevenue,
    dailyVolume: dailyVolume,
    timestamp: options.startOfDay,
  };
}

const prefetch = async (options: FetchOptions) => {
  const dailyStats = await queryDuneSql(options, dailyStatsQuery);

  return {
    dailyStats
  };
}

const methodology = {
  Fees: "Net revenue from payments and withdrawals (USDT)",
  Revenue: "Net revenue from payments and withdrawals (USDT)",
  Volume: "Total user payment volume (USDT)",
}

const adapter: Adapter = {
  adapter: {
    [CHAIN.OP_BNB]: {
      fetch: fetch,
      start: '2025-12-08', // Approximate start date based on block number in query
      runAtCurrTime: true,
    }
  },
  prefetch,
  dependencies: [Dependencies.DUNE],
  methodology,
}

export default adapter;
