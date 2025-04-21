import { CHAIN } from "../../helpers/chains";
import { FetchOptions } from "../../adapters/types";
import { queryDuneSql } from "../../helpers/dune";

const chains: Record<string, { duneChain: string; start: string }> = {
  [CHAIN.ETHEREUM]: { duneChain: "ethereum", start: "2023-06-22" },
  [CHAIN.OPTIMISM]: { duneChain: "optimism", start: "2023-09-19" },
  [CHAIN.BSC]: { duneChain: "binance", start: "2023-09-20" },
  [CHAIN.POLYGON]: { duneChain: "polygon", start: "2023-09-05" },
  [CHAIN.BASE]: { duneChain: "base", start: "2023-12-24" },
  [CHAIN.ARBITRUM]: { duneChain: "arbitrum", start: "2023-09-11" },
  [CHAIN.BERACHAIN]: { duneChain: "berachain", start: "2025-01-25" },
  [CHAIN.LINEA]: { duneChain: "linea", start: "2023-12-14" },
};

const fetchVolume = async (_: any, _1: any, options: FetchOptions) => {
  const { startTimestamp, endTimestamp, chain } = options;
  const chainConfig = chains[chain];
  if (!chainConfig) throw new Error(`Chain configuration not found for: ${chain}`);

  // https://dune.com/queries/4687193
  const data = await queryDuneSql(options, `
    WITH base_query AS (
        SELECT DISTINCT chain FROM dune.enso_finance.result_ethereum_token_transfers_with_prices
    ),
    base_query_filtered_for_chain AS (
        SELECT * FROM dune.enso_finance.result_ethereum_token_transfers_with_prices
        WHERE chain = LOWER('${chainConfig.duneChain}')
    ),
    Filtered_Transactions AS (
        SELECT *
        FROM base_query_filtered_for_chain
        WHERE block_time >= from_unixtime(${startTimestamp})
        AND block_time < from_unixtime(${endTimestamp})
    ),
    Aggregated_Volume_Time_Range AS (
        SELECT
            chain,
            COALESCE(SUM(dollar_value), 0) AS volume_timerange
        FROM Filtered_Transactions
        GROUP BY chain
    ),
    Aggregated_Total_Volume AS (
        SELECT
            chain,
            COALESCE(SUM(dollar_value), 0) AS total_volume
        FROM base_query_filtered_for_chain
        GROUP BY chain
    ),
    Additional_Volume_Berachain AS (
        SELECT
            COALESCE(SUM(extra_volume), 0) AS additional_volume_timerange,
            2952448573 AS additional_total_volume -- Sum total additional volume
        FROM (
            SELECT DATE '2025-02-05' AS extra_date, 1106583664 AS extra_volume
            UNION ALL
            SELECT DATE '2025-02-04', 1435404805
            UNION ALL
            SELECT DATE '2025-02-03', 410460104
        ) AS extra
        WHERE extra_date >= CAST(from_unixtime(${startTimestamp}) AS DATE)
          AND extra_date < CAST(from_unixtime(${endTimestamp}) AS DATE)
    ),
    Final_Volume AS (
        SELECT
            COALESCE(vTotal.chain, vtimerange.chain) AS chain,
            CASE
                WHEN LOWER('${chainConfig.duneChain}') = 'berachain'
                  AND EXISTS (SELECT 1 FROM base_query WHERE chain = 'berachain')
                  THEN COALESCE(vtimerange.volume_timerange, 0)
                WHEN LOWER('${chainConfig.duneChain}') = 'berachain'
                  THEN COALESCE(vtimerange.volume_timerange, 0) + (SELECT additional_volume_timerange FROM Additional_Volume_Berachain)
                ELSE COALESCE(vtimerange.volume_timerange, 0)
            END AS volume_timerange,
            COALESCE(
                CASE
                    WHEN LOWER('${chainConfig.duneChain}') = 'berachain'
                      AND EXISTS (SELECT 1 FROM base_query WHERE chain = 'berachain')
                      THEN vTotal.total_volume
                    WHEN LOWER('${chainConfig.duneChain}') = 'berachain'
                      THEN COALESCE(vTotal.total_volume, 0) + (SELECT additional_total_volume FROM Additional_Volume_Berachain)
                    ELSE vTotal.total_volume
                END,
                0
            ) AS total_volume
        FROM Aggregated_Total_Volume vTotal
        FULL OUTER JOIN Aggregated_Volume_Time_Range vtimerange
        ON vTotal.chain = vtimerange.chain

        UNION ALL

        SELECT
            'berachain' AS chain,
            CASE
                WHEN (SELECT additional_volume_timerange FROM Additional_Volume_Berachain) > 0
                    THEN (SELECT additional_volume_timerange FROM Additional_Volume_Berachain)
                ELSE 0
            END AS volume_timerange,
            (SELECT additional_total_volume FROM Additional_Volume_Berachain) AS total_volume
        WHERE LOWER('${chainConfig.duneChain}') = 'berachain'
          AND NOT EXISTS (
            SELECT 1 FROM base_query WHERE chain = 'berachain'
        )
    )
    SELECT
        chain AS blockchain,
        volume_timerange,
        total_volume
    FROM Final_Volume
    WHERE chain = LOWER('${chainConfig.duneChain}')
    ORDER BY volume_timerange DESC
  `);

  const chainData = data[0];
  if (!chainData) throw new Error(`Dune query failed: ${JSON.stringify(data)}`);

  return {
    dailyVolume: chainData.volume_timerange,
    totalVolume: chainData.total_volume,
    timestamp: endTimestamp,
  };
};

const adapter: any = {
  version: 1,
  isExpensiveAdapter: true,
  adapter: Object.fromEntries(
    Object.entries(chains).map(([chain, { start }]) => [
      chain,
      { fetch: fetchVolume, start },
    ])
  ),
};

export default adapter;
