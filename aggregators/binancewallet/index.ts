import { Dependencies, FetchOptions, FetchResult, SimpleAdapter } from "../../adapters/types";
import { queryDuneSql } from "../../helpers/dune";
import { CHAIN } from "../../helpers/chains";
import { getAllDexTokensBlacklisted } from "../../helpers/lists";

const chainConfig: Record<string, { start: string; duneChain: string; address: string }> = {
  [CHAIN.ETHEREUM]: { start: "2025-01-01", duneChain: "ethereum", address: "0xb300000b72DEAEb607a12d5f54773D1C19c7028d" },
  [CHAIN.ARBITRUM]: { start: "2025-01-01", duneChain: "arbitrum", address: "0xb300000b72DEAEb607a12d5f54773D1C19c7028d" },
  [CHAIN.POLYGON]: { start: "2025-01-01", duneChain: "polygon", address: "0xb300000b72DEAEb607a12d5f54773D1C19c7028d" },
  [CHAIN.BSC]: { start: "2025-01-01", duneChain: "bnb", address: "0xb300000b72DEAEb607a12d5f54773D1C19c7028d" },
  [CHAIN.AVAX]: { start: "2025-01-01", duneChain: "avalanche_c", address: "0xb300000b72DEAEb607a12d5f54773D1C19c7028d" },
  [CHAIN.OPTIMISM]: { start: "2025-01-01", duneChain: "optimism", address: "0xb300000b72DEAEb607a12d5f54773D1C19c7028d" },
  [CHAIN.BASE]: { start: "2025-01-01", duneChain: "base", address: "0xb300000b72DEAEb607a12d5f54773D1C19c7028d" },
  [CHAIN.LINEA]: { start: "2025-01-01", duneChain: "linea", address: "0xe8B592a331a192d5988EFFff40586CF032e26277" },
  [CHAIN.SONIC]: { start: "2025-01-01", duneChain: "sonic", address: "0x610776e63C5ca21B92217F4c06398E5437dB6A1E" },
  [CHAIN.ERA]: { start: "2025-01-01", duneChain: "zksync", address: "0x45a0B6ac062a6F137dDC12C01E580cfed1A6F4EC" },
  [CHAIN.SOLANA]: { start: "2025-01-01", duneChain: "solana", address: "B3111yJCeHBcA1bizdJjUFPALfhAfSRnAbJzGUtnt56A" },
  [CHAIN.PLASMA]: { start: "2025-01-01", duneChain: "plasma", address: "0x610776e63C5ca21B92217F4c06398E5437dB6A1E" },
};

const evmConfig = Object.values(chainConfig).filter((c) => c.duneChain !== "solana");
const evmFilter = evmConfig
  .map((c) => `(blockchain = '${c.duneChain}' AND tx_to = ${c.address})`)
  .join(" OR ");

const prefetch = async (options: FetchOptions) => {
  const tenHoursAgo = Date.now() - (10 * 60 * 60 * 1000);
  if ((options.toTimestamp * 1000) > tenHoursAgo) {
    throw new Error("End timestamp is less than 10 hours ago, skipping due to dune indexing delay");
  }

  const blacklisted = getAllDexTokensBlacklisted();

  const sql_query = `
    WITH solana_txs AS (
      SELECT
        tx_id
      FROM solana.account_activity
      WHERE TIME_RANGE
        AND tx_success = TRUE
        AND address = '${chainConfig[CHAIN.SOLANA].address}'
      GROUP BY 1
    ),
    sol AS (
      SELECT
        t.blockchain,
        SUM(t.amount_usd) AS trading_volume
      FROM dex_solana.trades t
      INNER JOIN solana_txs b ON t.tx_id = b.tx_id
      WHERE TIME_RANGE
        AND t.amount_usd < 10000000
      GROUP BY 1
    ),
    evm AS (
      SELECT
        blockchain,
        SUM(amount_usd) AS trading_volume
      FROM dex.trades
      WHERE TIME_RANGE
        AND (${evmFilter})
        AND amount_usd IS NOT NULL
        AND amount_usd < 10000000
        AND token_sold_address NOT IN (${blacklisted.toString()})
        AND token_bought_address NOT IN (${blacklisted.toString()})
      GROUP BY 1
    ),
    total AS (
      SELECT
        blockchain,
        trading_volume
      FROM sol
      UNION ALL
      SELECT
        blockchain,
        trading_volume
      FROM evm
    )
    SELECT
      blockchain,
      SUM(trading_volume) AS volume_24h
    FROM total
    GROUP BY 1
  `;
  return queryDuneSql(options, sql_query);
};

const fetch = async (options: FetchOptions): Promise<FetchResult> => {
  const results = options.preFetchedResults || [];
  const chainData = results.find((item: any) => item.blockchain === chainConfig[options.chain].duneChain);

  return {
    dailyVolume: chainData ? chainData.volume_24h : 0,
  };
};

const adapter: SimpleAdapter = {
  version: 1,
  dependencies: [Dependencies.DUNE],
  fetch,
  adapter: chainConfig,
  prefetch,
  isExpensiveAdapter: true,
};

export default adapter;