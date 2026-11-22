import { Dependencies, FetchOptions, SimpleAdapter } from '../adapters/types';
import { CHAIN } from '../helpers/chains';
import { queryDuneSql } from '../helpers/dune';
import { assertDuneSolanaIndexed } from '../helpers/duneSolanaDex';
import { httpGet } from '../utils/fetchURL';
import { sleep } from '../utils/utils';

// Meteora DLMM volume from dex_solana.trades (one row per swap, valued off the SOL/USDC side at swap time), plus the
// swaps that have no trade row (below). Unpriced swaps fall back to the raw sold amount. Pools on Meteora's own
// blacklist (wash/scam pools, flagged is_blacklisted in the DLMM API) are excluded.

type DuneRow = {
  pool: string;
  mint: string;
  priced_volume_usd: string;
  unpriced_sold_raw: string;
};

const DLMM_API = 'https://dlmm.datapi.meteora.ag/pools';
const PAGE_SIZE = 1000; // API max

// Spellbook's meteora_v2_solana_base_trades still reads the exact-out and price-impact call tables under their old
// names (lb_clmm_call_swapexactout, ...), which Dune's decoding replaced with snake_case ones on 2026-05-13
// (lb_clmm_call_swap_exact_out, ...). Since then swap_exact_out, swap_exact_out2 and swap_with_price_impact(2) get
// no dex_solana.trades row. Those swaps are taken from the program's own Swap2Evt event: amount_in in the input mint
// (token X when swap_for_y), valued at the pool's average price that day in its counted trades. An event that
// gets a trade row is matched to it and not added twice.
const DLMM_PROGRAM = 'LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo';
const NO_TRADE_ROW_CALLS = ['swap_exact_out', 'swap_exact_out2', 'swap_with_price_impact', 'swap_with_price_impact2'];

const getQuery = (options: FetchOptions) => `
WITH
trades AS (
  SELECT
    tx_id,
    outer_instruction_index,
    project_program_id AS pool,
    token_sold_mint_address AS sold_mint,
    token_bought_mint_address AS bought_mint,
    amount_usd,
    token_sold_amount_raw AS sold_raw,
    CAST(token_bought_amount_raw AS DOUBLE) AS bought_raw,
    row_number() OVER (PARTITION BY tx_id, outer_instruction_index ORDER BY inner_instruction_index) AS swap_number
  FROM dex_solana.trades
  WHERE block_month >= CAST(date_trunc('month', from_unixtime(${options.startTimestamp})) AS DATE)
    AND block_month <= CAST(date_trunc('month', from_unixtime(${options.endTimestamp} - 1)) AS DATE)
    AND block_time >= from_unixtime(${options.startTimestamp})
    AND block_time < from_unixtime(${options.endTimestamp})
    AND project = 'meteora'
    AND version = 2
),
pool_prices AS (
  -- USD per raw unit of each pool token, from the pool's counted trades of the window
  SELECT pool, mint, sum(amount_usd) / sum(raw) AS usd_per_raw
  FROM (
    SELECT pool, sold_mint AS mint, amount_usd, CAST(sold_raw AS DOUBLE) AS raw FROM trades
    UNION ALL
    SELECT pool, bought_mint, amount_usd, bought_raw FROM trades
  )
  WHERE amount_usd > 0 AND raw > 0
  GROUP BY 1, 2
),
pool_mints AS (
  SELECT DISTINCT account_lb_pair AS pool, account_token_x_mint AS token_x, account_token_y_mint AS token_y
  FROM (
${[...NO_TRADE_ROW_CALLS, 'swap', 'swap2'].map((call) => `    SELECT account_lb_pair, account_token_x_mint, account_token_y_mint
    FROM dlmm_solana.lb_clmm_call_${call}
    WHERE call_block_date >= CAST(from_unixtime(${options.startTimestamp}) AS DATE)
      AND call_block_date <= CAST(from_unixtime(${options.endTimestamp} - 1) AS DATE)
      AND call_block_time >= from_unixtime(${options.startTimestamp})
      AND call_block_time < from_unixtime(${options.endTimestamp})
      AND call_tx_success = true`).join('\n    UNION ALL\n')}
  )
),
events AS (
  SELECT
    evt_tx_id AS tx_id,
    coalesce(evt_outer_instruction_index, 0) AS outer_instruction_index,
    lb_pair AS pool,
    swap_for_y,
    amount_in,
    row_number() OVER (PARTITION BY evt_tx_id, coalesce(evt_outer_instruction_index, 0) ORDER BY coalesce(evt_inner_instruction_index, 0)) AS swap_number
  FROM dlmm_solana.lb_clmm_evt_swap2evt
  WHERE evt_block_date >= CAST(from_unixtime(${options.startTimestamp}) AS DATE)
    AND evt_block_date <= CAST(from_unixtime(${options.endTimestamp} - 1) AS DATE)
    AND evt_block_time >= from_unixtime(${options.startTimestamp})
    AND evt_block_time < from_unixtime(${options.endTimestamp})
    AND evt_inner_executing_account = '${DLMM_PROGRAM}'
),
no_trade_row AS (
  -- swap events with no dex_solana.trades row: trades and events are numbered within the outer instruction, as Spellbook pairs them
  SELECT
    e.pool,
    CASE WHEN e.swap_for_y THEN m.token_x ELSE m.token_y END AS mint,
    e.amount_in AS sold_raw
  FROM events e
  LEFT JOIN trades t
    ON t.tx_id = e.tx_id
   AND t.outer_instruction_index = e.outer_instruction_index
   AND t.swap_number = e.swap_number
  LEFT JOIN pool_mints m ON m.pool = e.pool
  WHERE t.tx_id IS NULL
)
SELECT
  pool,
  mint,
  CAST(coalesce(sum(amount_usd), 0) AS VARCHAR) AS priced_volume_usd,
  CAST(coalesce(sum(CASE WHEN amount_usd IS NULL THEN sold_raw END), 0) AS VARCHAR) AS unpriced_sold_raw
FROM (
  SELECT pool, sold_mint AS mint, amount_usd, sold_raw FROM trades
  UNION ALL
  SELECT n.pool, n.mint, CAST(n.sold_raw AS DOUBLE) * p.usd_per_raw, n.sold_raw
  FROM no_trade_row n
  LEFT JOIN pool_prices p ON p.pool = n.pool AND p.mint = n.mint
)
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
  assertDuneSolanaIndexed(options);

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
    if (!row.mint) throw new Error(`meteora-dlmm: swap in pool ${row.pool} with no trade row and no ${NO_TRADE_ROW_CALLS.join('/')} call to read its mints from`);
    dailyVolume.addUSDValue(Number(row.priced_volume_usd));
    dailyVolume.add(row.mint, row.unpriced_sold_raw);
  }
  options.api.log(`meteora-dlmm: ${pools.size} pools traded, ${excluded.size} excluded by Meteora's blacklist (${blacklisted.size} pools listed)`);

  return { dailyVolume };
};

const methodology = {
  Volume: 'Value of the tokens traders sold in Meteora DLMM swaps, taken from decoded onchain swaps and valued at the time of each swap. Exact-out and price-impact swaps, which have no decoded trade row, come from the DLMM swap events and are valued at the average price of the same pool that day. Pools blacklisted by Meteora are excluded.',
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
