import { CHAIN } from "../../helpers/chains";
import { Dependencies, FetchOptions } from "../../adapters/types";
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
  [CHAIN.SONIC]: { duneChain: "sonic", start: "2025-01-01" },
  [CHAIN.UNICHAIN]: { duneChain: "unichain", start: "2025-01-01" },
  [CHAIN.HYPERLIQUID]: { duneChain: "hyperevm", start: "2025-01-01" },
  [CHAIN.KATANA]: { duneChain: "katana", start: "2025-01-01" },
  [CHAIN.PLUME]: { duneChain: "plume", start: "2025-01-01" },
  [CHAIN.ZKSYNC]: { duneChain: "zksync", start: "2025-01-01" },
  [CHAIN.AVAX]: { duneChain: "avalanche_c", start: "2023-01-01" },
  [CHAIN.XDAI]: { duneChain: "gnosis", start: "2023-01-01" },
  [CHAIN.PLASMA]: { duneChain: "plasma", start: "2025-10-01" },
  [CHAIN.MONAD]: { duneChain: "monad", start: "2025-11-01" },
};

// Prefetch function that will run once before any fetch calls
const prefetch = async (options: FetchOptions) => {
  const { startTimestamp, endTimestamp } = options;
  
  return queryDuneSql(options, `
    WITH base_query AS (
        SELECT DISTINCT chain FROM dune.enso_finance.result_ethereum_token_transfers_with_prices
    ),
    Filtered_Transactions AS (
        SELECT *
        FROM dune.enso_finance.result_ethereum_token_transfers_with_prices
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
    Additional_Volume_Berachain AS (
        SELECT
            'berachain' AS chain,
            COALESCE(SUM(extra_volume), 0) AS additional_volume_timerange
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
            vtimerange.chain,
            COALESCE(vtimerange.volume_timerange, 0) AS volume_timerange
        FROM Aggregated_Volume_Time_Range vtimerange

        UNION ALL

        SELECT
            chain,
            additional_volume_timerange AS volume_timerange
        FROM Additional_Volume_Berachain
    )
    SELECT
        chain AS blockchain,
        volume_timerange
    FROM Final_Volume
    ORDER BY volume_timerange DESC
  `);
};

const fetchVolume = async (_: any, _1: any, options: FetchOptions) => {
  const { endTimestamp, chain } = options;
  const chainConfig = chains[chain];
  if (!chainConfig) throw new Error(`Chain configuration not found for: ${chain}`);

  const data = options.preFetchedResults || [];
  const chainData = data.find(item => item.blockchain === chainConfig.duneChain.toLowerCase());
  
  if (!chainData) {
    return {
      dailyVolume: 0,
      timestamp: endTimestamp,
    };
  }

  return {
    dailyVolume: chainData.volume_timerange,
    timestamp: endTimestamp,
  };
};

const adapter: any = {
  version: 1,
  isExpensiveAdapter: true,
  dependencies: [Dependencies.DUNE],
  adapter: Object.fromEntries(
    Object.entries(chains).map(([chain, { start }]) => [
      chain,
      { fetch: fetchVolume, start },
    ])
  ),
  prefetch: prefetch,
};

export default adapter;
