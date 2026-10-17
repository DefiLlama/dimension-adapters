import { Dependencies, FetchOptions, SimpleAdapter } from '../adapters/types';
import { CHAIN } from '../helpers/chains';
import { queryDuneSql } from '../helpers/dune';
import { httpGet } from '../utils/fetchURL';
import { sleep } from '../utils/utils';

// Meteora DLMM volume from dex_solana.trades (one row per swap, valued off the SOL/USDC side at swap time).
// Unpriced swaps fall back to the raw sold amount. Pools on Meteora's own blacklist (wash/scam pools, flagged
// is_blacklisted in the DLMM API) are excluded.

type DuneRow = {
  pool: string;
  mint: string;
  priced_volume_usd: string;
  unpriced_sold_raw: string;
};

const DLMM_API = 'https://dlmm.datapi.meteora.ag/pools';
const PAGE_SIZE = 1000; // API max

const getQuery = (options: FetchOptions) => `
SELECT
  project_program_id AS pool,
  token_sold_mint_address AS mint,
  CAST(coalesce(sum(amount_usd), 0) AS VARCHAR) AS priced_volume_usd,
  CAST(coalesce(sum(CASE WHEN amount_usd IS NULL THEN token_sold_amount_raw END), 0) AS VARCHAR) AS unpriced_sold_raw
FROM dex_solana.trades
WHERE block_month >= CAST(date_trunc('month', from_unixtime(${options.startTimestamp})) AS DATE)
  AND block_month <= CAST(date_trunc('month', from_unixtime(${options.endTimestamp} - 1)) AS DATE)
  AND block_time >= from_unixtime(${options.startTimestamp})
  AND block_time < from_unixtime(${options.endTimestamp})
  AND project = 'meteora'
  AND version = 2
GROUP BY 1, 2
`;

const getBlacklistedPools = async (): Promise<Set<string>> => {
  const pools = new Set<string>();
  for (let page = 1; ; page++) {
    // sorted by creation time so pages are stable (the default volume sort reshuffles ties between pages)
    const res = await httpGet(`${DLMM_API}?page=${page}&page_size=${PAGE_SIZE}&filter_by=is_blacklisted%3Dtrue&sort_by=pool_created_at%3Aasc`);
    if (!Array.isArray(res.data) || !Number.isFinite(res.pages)) throw new Error('meteora-dlmm: unexpected DLMM API response');
    for (const pool of res.data) pools.add(pool.address);
    if (!res.data.length || page >= res.pages) break;
    await sleep(100);
  }
  return pools;
};

const fetch = async (options: FetchOptions) => {
  const [rows, blacklisted] = await Promise.all([
    queryDuneSql(options, getQuery(options)) as Promise<DuneRow[]>,
    getBlacklistedPools(),
  ]);
  if (!rows.length) throw new Error('meteora-dlmm: Dune returned no swaps for the window');

  const dailyVolume = options.createBalances();
  const pools = new Set<string>();
  const excluded = new Set<string>();
  for (const row of rows) {
    pools.add(row.pool);
    if (blacklisted.has(row.pool)) {
      excluded.add(row.pool);
      continue;
    }
    dailyVolume.addUSDValue(Number(row.priced_volume_usd));
    dailyVolume.add(row.mint, row.unpriced_sold_raw);
  }
  options.api.log(`meteora-dlmm: ${pools.size} pools traded, ${excluded.size} excluded by Meteora's blacklist (${blacklisted.size} pools listed)`);

  return { dailyVolume };
};

const methodology = {
  Volume: 'Value of the tokens traders sold in Meteora DLMM swaps, taken from decoded onchain swaps and valued at the time of each swap. Pools blacklisted by Meteora are excluded.',
};

const adapter: SimpleAdapter = {
  version: 1,
  methodology,
  fetch,
  chains: [CHAIN.SOLANA],
  start: '2023-11-07',
  dependencies: [Dependencies.DUNE],
  isExpensiveAdapter: true,
};

export default adapter;
