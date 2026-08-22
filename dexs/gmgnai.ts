import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryDuneSql } from "../helpers/dune";

const chainConfig: Record<string, { duneName: string, start: string }> = {
  [CHAIN.ETHEREUM]: {
    duneName: 'ethereum',
    start: '2023-09-19'
  },
  [CHAIN.SOLANA]: {
    duneName: 'solana',
    start: '2024-03-20'
  },
  [CHAIN.BASE]: {
    duneName: 'base',
    start: '2024-06-05'
  },
  [CHAIN.BSC]: {
    duneName: 'bnb',
    start: '2024-11-27'
  },
  [CHAIN.MONAD]: {
    duneName: 'monad',
    start: '2025-11-22'
  },
  [CHAIN.HYPERLIQUID]: {
    duneName: 'hyperevm',
    start: '2026-05-21'
  },
  [CHAIN.MEGAETH]: {
    duneName: 'megaeth',
    start: '2026-05-19'
  },
  [CHAIN.XLAYER]: {
    duneName: 'xlayer',
    start: '2026-06-23'
  },
  [CHAIN.ROBINHOOD]: {
    duneName: 'robinhood',
    start: '2026-07-03'
  },
  [CHAIN.ARBITRUM]: {
    duneName: 'arbitrum',
    start: '2026-08-19'
  }
}

async function prefetch(options: FetchOptions) {
  const query = `
    SELECT
      blockchain,COALESCE(SUM(CAST(volume_usd AS double)), 0) AS daily_volume
    FROM dune.adam_tehc_co.dataset_gmgn_daily
    WHERE day = '${options.dateString}'
    GROUP BY blockchain
  `;
  const queryResults = await queryDuneSql(options, query)
  if (queryResults.length === 0) {
    throw new Error('No volume data found for any chain');
  }
  return queryResults
}

async function fetch(options: FetchOptions) {
  const prefetchResults = options.preFetchedResults;
  const chainVolume = prefetchResults.find((result: any) => result.blockchain === chainConfig[options.chain].duneName);

  return {
    dailyVolume: chainVolume?.daily_volume ?? 0 // entry won't exist if chain has no volume
  }
}

const adapter: SimpleAdapter = {
  version: 1,
  prefetch,
  fetch,
  adapter: chainConfig,
  dependencies: [Dependencies.DUNE],
  isExpensiveAdapter: true,
  doublecounted: true,
};

export default adapter;
