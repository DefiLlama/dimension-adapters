import { CHAIN } from "../../helpers/chains";
import { Dependencies, FetchOptions } from "../../adapters/types";
import { queryDuneSql } from "../../helpers/dune";

// Only Arbitrum
const chains: Record<string, { duneChain: string; start: string }> = {
  [CHAIN.ARBITRUM]: { duneChain: "arbitrum", start: "2025-08-12" },
};

// ---------------------- PREFETCH ----------------------
const prefetch = async (options: FetchOptions) => {
  const { startTimestamp, endTimestamp } = options;

  return queryDuneSql(options, `
    WITH txs AS (
      SELECT 
        'arbitrum' AS chain,
        block_time,
        hash
      FROM arbitrum.transactions
      WHERE "to" IN (
        '0x93dDB2307F3Af5df85F361E5Cddd898Acd3d132d',
        '0xAf1189aFd1F1880F09AeC3Cbc32cf415c735C710',
        '0x3509F38e10eB3cDcE7695743cB7e81446F4d8A33'
      )
      AND success = TRUE
    )
    SELECT
      chain AS blockchain,
      COUNT(DISTINCT hash) AS tx_count
    FROM txs
    WHERE block_time >= from_unixtime(${startTimestamp})
      AND block_time < from_unixtime(${endTimestamp})
    GROUP BY chain
  `);
};

// ---------------------- FETCH ----------------------
const fetchTxCount = async (_: any, _1: any, options: FetchOptions) => {
  const { endTimestamp, chain } = options;
  const chainConfig = chains[chain];

  if (!chainConfig) throw new Error(`Chain configuration not found: ${chain}`);

  const results = options.preFetchedResults || [];
  const row = results.find(r => r.blockchain === chainConfig.duneChain);

  return {
    dailyTransactionCount: row?.tx_count ?? 0,
    timestamp: endTimestamp,
  };
};

// ---------------------- EXPORT ----------------------
const adapter: any = {
  version: 1,
  isExpensiveAdapter: true,
  dependencies: [Dependencies.DUNE],
  prefetch,

  adapter: Object.fromEntries(
    Object.entries(chains).map(([chain, { start }]) => [
      chain,
      { fetch: fetchTxCount, start },
    ])
  ),
};

export default adapter;
