import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";

// Volume = every swap's input-side amount priced in the input token.
// - swap_in (exact-in): amount_in is a call argument (dex_call_swap_in.amount_in).
// - swap_out (exact-out): amount_in is not a call arg, but the DEX emits a LogSwap event
//   (Anchor `emit!`) which appears as a "Program data: yvLkHCXC..." line in call_log_messages.
//   We decode the base64 payload and read amount_in (u64 LE at byte 11 after the 8-byte
//   Anchor discriminator + u16 dex_id + u8 swap_0_to_1). Verified against on-chain data:
//   the 3 historical swap_out txs decode to 1,283,885 / 1,283,391 / 1,501,258 — matching
//   the actual token transfers.
//
// LogSwap discriminator = [0xCA,0xF2,0xE4,0x1C,0x25,0xC2,0x34,0x22]; base64 = "yvLkHCXCNCIC".

const fetch = async (options: FetchOptions) => {
  const sql = `
    WITH pools AS (
      SELECT DISTINCT
        account_dex     AS pool,
        account_token_0 AS token_0,
        account_token_1 AS token_1
      FROM jupiter_lend_solana.dex_call_init_dex
    ),
    swap_in_vol AS (
      SELECT
        s.account_dex                     AS pool,
        s.swap0to1                        AS swap0to1,
        CAST(s.amount_in AS DOUBLE)       AS amount_in
      FROM jupiter_lend_solana.dex_call_swap_in s
      WHERE s.call_block_time >= from_unixtime(${options.startTimestamp})
        AND s.call_block_time <  from_unixtime(${options.endTimestamp})
    ),
    swap_out_events AS (
      SELECT
        s.account_dex                                                             AS pool,
        s.swap0to1                                                                AS swap0to1,
        CAST(from_big_endian_64(reverse(SUBSTR(from_base64(SUBSTR(msg, 15)), 12, 8))) AS DOUBLE) AS amount_in
      FROM jupiter_lend_solana.dex_call_swap_out s
      CROSS JOIN UNNEST(s.call_log_messages) AS t(msg)
      WHERE s.call_block_time >= from_unixtime(${options.startTimestamp})
        AND s.call_block_time <  from_unixtime(${options.endTimestamp})
        AND msg LIKE 'Program data: yvLkHCXCNCIC%'
    ),
    all_swaps AS (
      SELECT pool, swap0to1, amount_in FROM swap_in_vol
      UNION ALL
      SELECT pool, swap0to1, amount_in FROM swap_out_events
    )
    SELECT
      p.token_0,
      p.token_1,
      a.swap0to1,
      SUM(a.amount_in) AS amount_in_sum
    FROM all_swaps a
    JOIN pools p ON a.pool = p.pool
    GROUP BY p.token_0, p.token_1, a.swap0to1
  `;

  const rows: any[] = await queryDuneSql(options, sql);
  const dailyVolume = options.createBalances();

  for (const row of rows) {
    const inputMint: string = row.swap0to1 ? row.token_0 : row.token_1;
    dailyVolume.add(inputMint, Number(row.amount_in_sum));
  }

  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.SOLANA],
  start: '2026-06-18',
  dependencies: [Dependencies.DUNE],
  isExpensiveAdapter: true,
  methodology: {
    Volume:
      "Notional traded (input-side, priced in the input token) across all Jupiter Lend AMM pools. For exact-in swaps (dex_call_swap_in), amount_in is read directly from the call argument. For exact-out swaps (dex_call_swap_out), amount_in is decoded from the LogSwap Anchor event embedded in call_log_messages (Program data: yvLkHCXCNCIC... base64 line): after the 8-byte discriminator and u16/u8 header, the u64 little-endian at byte 11 is amount_in. Per-pool token identity comes from dex_call_init_dex.",
  },
};

export default adapter;
