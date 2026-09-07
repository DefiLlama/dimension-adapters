import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";

// Volume = one leg of every swap, priced in that leg's token.
// - swap_in (exact-in): amount_in is a call argument, so value the input leg.
// - swap_out (exact-out): amount_out is a call argument, so value the output leg.
//
// Pool token identity comes from the swap calls, NOT from init_dex: init_dex decodes
// account_token_1 as the system program for the oldest pool (the USDC/USDT pool, which
// is ~98% of all swaps), which would send half that pool's volume to an unpriceable
// mint. init_dex is kept as the fallback for pools that have never traded.

const fetch = async (options: FetchOptions) => {
  const sql = `
    WITH pool_tokens_swap AS (
      SELECT DISTINCT account_dex AS pool, account_token_0 AS token_0, account_token_1 AS token_1
      FROM jupiter_lend_solana.dex_call_swap_in
      UNION
      SELECT DISTINCT account_dex, account_token_0, account_token_1
      FROM jupiter_lend_solana.dex_call_swap_out
    ),
    pool_tokens_init AS (
      SELECT DISTINCT account_dex AS pool, account_token_0 AS token_0, account_token_1 AS token_1
      FROM jupiter_lend_solana.dex_call_init_dex
    ),
    pools AS (
      SELECT
        COALESCE(s.pool, i.pool)       AS pool,
        COALESCE(s.token_0, i.token_0) AS token_0,
        COALESCE(s.token_1, i.token_1) AS token_1
      FROM pool_tokens_init i
      FULL OUTER JOIN pool_tokens_swap s ON i.pool = s.pool
    ),
    swaps AS (
      SELECT account_dex AS pool, swap0to1, TRUE AS is_exact_in, CAST(amount_in AS DOUBLE) AS amount
      FROM jupiter_lend_solana.dex_call_swap_in
      WHERE call_block_time >= from_unixtime(${options.startTimestamp})
        AND call_block_time <  from_unixtime(${options.endTimestamp})
      UNION ALL
      SELECT account_dex, swap0to1, FALSE, CAST(amount_out AS DOUBLE)
      FROM jupiter_lend_solana.dex_call_swap_out
      WHERE call_block_time >= from_unixtime(${options.startTimestamp})
        AND call_block_time <  from_unixtime(${options.endTimestamp})
    )
    SELECT
      CASE WHEN s.is_exact_in
           THEN CASE WHEN s.swap0to1 THEN p.token_0 ELSE p.token_1 END
           ELSE CASE WHEN s.swap0to1 THEN p.token_1 ELSE p.token_0 END
      END           AS mint,
      SUM(s.amount) AS amount
    FROM swaps s
    JOIN pools p ON s.pool = p.pool
    GROUP BY 1
  `;

  const rows: any[] = await queryDuneSql(options, sql);
  const dailyVolume = options.createBalances();

  for (const row of rows) {
    dailyVolume.add(row.mint, Number(row.amount));
  }

  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.SOLANA],
  start: '2026-06-22',
  dependencies: [Dependencies.DUNE],
  isExpensiveAdapter: true,
  methodology: {
    Volume:
      "Notional traded across all Jupiter Lend AMM pools. Exact-in swaps (dex_call_swap_in) are valued on the input leg using the amount_in call argument; exact-out swaps (dex_call_swap_out) are valued on the output leg using the amount_out call argument. Per-pool token identity comes from the swap calls, with dex_call_init_dex as a fallback for pools that have never traded.",
  },
};

export default adapter;
