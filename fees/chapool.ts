import { Adapter, Dependencies, FetchOptions, FetchResult } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryDuneSql } from "../helpers/dune";

const dailyRevenueQuery = `
WITH daily_payments AS (
    SELECT 
        DATE(block_time) as payment_date,
        SUM(varbinary_to_uint256(bytearray_substring(data, 65, 32))) as daily_volume
    FROM opbnb.logs
    WHERE 
        contract_address = 0xEe83640f0ed07d36E799531CC6d87FB4CDcCaC13
        AND topic0 = 0x32aced27dfd49efcd31ceb0567a1ef533d2ab1481334c3f316047bf16fe1c8e8
        AND block_number >= 92328871
    GROUP BY DATE(block_time)
),
daily_refunds AS (
    SELECT 
        DATE(block_time) as refund_date,
        SUM(varbinary_to_uint256(bytearray_substring(data, 65, 32))) as daily_refund_volume
    FROM opbnb.logs
    WHERE 
        contract_address = 0xEe83640f0ed07d36E799531CC6d87FB4CDcCaC13
        AND topic0 = 0x4d60a9438ba7e18c1fed7577dc8932bfe82f683c1e254a5336b6618ab5301641
        AND block_number >= 92328871
    GROUP BY DATE(block_time)
),
eth_price AS (
    SELECT price
    FROM prices.usd
    WHERE symbol = 'ETH'
    AND blockchain = 'opbnb'
    ORDER BY minute DESC
    LIMIT 1
)
SELECT 
    COALESCE(dp.payment_date, dr.refund_date) as date,
    (COALESCE(dp.daily_volume, 0) - COALESCE(dr.daily_refund_volume, 0)) / 1e18 as daily_net_revenue_eth,
    (COALESCE(dp.daily_volume, 0) - COALESCE(dr.daily_refund_volume, 0)) / 1e18 * COALESCE(ep.price, 2500) as daily_net_revenue_usd
FROM daily_payments dp
FULL OUTER JOIN daily_refunds dr ON dp.payment_date = dr.refund_date
CROSS JOIN eth_price ep
ORDER BY date DESC
`;

const dailyVolumeQuery = `
WITH daily_payments AS (
    SELECT 
        DATE(block_time) as payment_date,
        SUM(varbinary_to_uint256(bytearray_substring(data, 65, 32))) as daily_volume
    FROM opbnb.logs
    WHERE 
        contract_address = 0xEe83640f0ed07d36E799531CC6d87FB4CDcCaC13
        AND topic0 = 0x32aced27dfd49efcd31ceb0567a1ef533d2ab1481334c3f316047bf16fe1c8e8
        AND block_number >= 92328871
    GROUP BY DATE(block_time)
),
eth_price AS (
    SELECT price
    FROM prices.usd
    WHERE symbol = 'ETH'
    AND blockchain = 'opbnb'
    ORDER BY minute DESC
    LIMIT 1
)
SELECT 
    dp.payment_date as date,
    dp.daily_volume / 1e18 as daily_volume_eth,
    (dp.daily_volume / 1e18) * COALESCE(ep.price, 2500) as daily_volume_usd
FROM daily_payments dp
CROSS JOIN eth_price ep
ORDER BY date DESC
`;

const fetch = async (_timestamp: number, _: any, options: FetchOptions): Promise<FetchResult> => {
  const preFetchedResults = options.preFetchedResults;
  const dailyRevenueData = preFetchedResults.dailyRevenue || [];
  const dailyVolumeData = preFetchedResults.dailyVolume || [];

  // Dune dates are usually strings like "2023-01-01 00:00:00"
  const dayStr = new Date(options.startOfDay * 1000).toISOString().split('T')[0];

  const dailyRevRow = dailyRevenueData.find((row: any) => {
    // handle potential date format differences
    const rowDate = row.date ? row.date.toString().split('T')[0] : "";
    return rowDate === dayStr;
  });

  const dailyVolRow = dailyVolumeData.find((row: any) => {
    const rowDate = row.date ? row.date.toString().split('T')[0] : "";
    return rowDate === dayStr;
  });

  const dailyRevenue = dailyRevRow ? dailyRevRow.daily_net_revenue_usd : undefined;
  const dailyVolume = dailyVolRow ? dailyVolRow.daily_volume_usd : undefined;
  
  return {
    dailyFees: dailyRevenue, // Assuming fees = revenue for this protocol based on description
    dailyRevenue: dailyRevenue,
    dailyVolume: dailyVolume,
    timestamp: options.startOfDay,
  };
}

const prefetch = async (options: FetchOptions) => {
  const [dailyRevenue, dailyVolume] = await Promise.all([
    queryDuneSql(options, dailyRevenueQuery),
    queryDuneSql(options, dailyVolumeQuery)
  ]);

  return {
    dailyRevenue,
    dailyVolume
  };
}

const methodology = {
  Fees: "Net revenue from payments and refunds",
  Revenue: "Net revenue from payments and refunds",
  Volume: "Total user payment volume",
}

const adapter: Adapter = {
  adapter: {
    [CHAIN.OP_BNB]: {
      fetch: fetch,
      start: '2024-12-01', // Approximate start date based on block number in query
      runAtCurrTime: true,
    }
  },
  prefetch,
  dependencies: [Dependencies.DUNE],
  methodology,
}

export default adapter;
