import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";

// Fees = per-swap (input notional * fee_at_that_time / 1e6), priced in the input token.
// Fee history is init_dex ∪ every subsequent update_fee_and_revenue_cut call, window-joined
// so a swap always uses the fee that was live at its block_time.
//
// amount_in resolution:
// - swap_in: exact from call arg (dex_call_swap_in.amount_in).
// - swap_out: decoded from the Anchor LogSwap event in call_log_messages
//   ("Program data: yvLkHCXCNCIC..." — base64 payload after 8-byte discriminator + u16 dex_id
//   + u8 swap_0_to_1, u64 little-endian amount_in at byte 11).
//
// Revenue split: LP = fee * (1 - revenue_cut/1e6). Protocol = fee * revenue_cut/1e6.
// Jupiter and Fluid share the protocol cut 50/50. AMM fees do NOT feed the JUP buyback.

const FEE_SCALE = 1e6;            // fee arg is in ppm (u32 in IDL)
const REVENUE_CUT_SCALE = 1e6;    // revenue_cut arg is in ppm (u32 in IDL)
const JUPITER_SHARE_OF_PROTOCOL = 0.5;

const fetch = async (options: FetchOptions) => {
  const sql = `
    WITH pools AS (
      SELECT DISTINCT
        account_dex     AS pool,
        account_token_0 AS token_0,
        account_token_1 AS token_1
      FROM jupiter_lend_solana.dex_call_init_dex
    ),
    fee_events AS (
      SELECT
        account_dex AS pool,
        CAST(json_extract_scalar(params, '$.InitDexParams.fee') AS BIGINT)         AS fee,
        CAST(json_extract_scalar(params, '$.InitDexParams.revenue_cut') AS BIGINT) AS revenue_cut,
        call_block_time
      FROM jupiter_lend_solana.dex_call_init_dex
      UNION ALL
      SELECT
        account_dex AS pool,
        fee,
        revenue_cut,
        call_block_time
      FROM jupiter_lend_solana.dex_call_update_fee_and_revenue_cut
    ),
    fee_ranges AS (
      SELECT
        pool, fee, revenue_cut,
        call_block_time                                                        AS effective_from,
        LEAD(call_block_time) OVER (PARTITION BY pool ORDER BY call_block_time) AS effective_to
      FROM fee_events
    ),
    swap_in_rows AS (
      SELECT
        s.account_dex                     AS pool,
        s.swap0to1                        AS swap0to1,
        s.call_block_time,
        CAST(s.amount_in AS DOUBLE)       AS amount_in
      FROM jupiter_lend_solana.dex_call_swap_in s
      WHERE s.call_block_time >= from_unixtime(${options.startTimestamp})
        AND s.call_block_time <  from_unixtime(${options.endTimestamp})
    ),
    swap_out_rows AS (
      SELECT
        s.account_dex                     AS pool,
        s.swap0to1                        AS swap0to1,
        s.call_block_time,
        CAST(from_big_endian_64(reverse(SUBSTR(from_base64(SUBSTR(msg, 15)), 12, 8))) AS DOUBLE) AS amount_in
      FROM jupiter_lend_solana.dex_call_swap_out s
      CROSS JOIN UNNEST(s.call_log_messages) AS t(msg)
      WHERE s.call_block_time >= from_unixtime(${options.startTimestamp})
        AND s.call_block_time <  from_unixtime(${options.endTimestamp})
        AND msg LIKE 'Program data: yvLkHCXCNCIC%'
    ),
    all_swaps AS (
      SELECT pool, swap0to1, call_block_time, amount_in FROM swap_in_rows
      UNION ALL
      SELECT pool, swap0to1, call_block_time, amount_in FROM swap_out_rows
    ),
    priced AS (
      SELECT
        p.token_0,
        p.token_1,
        a.swap0to1,
        a.amount_in,
        fr.fee,
        fr.revenue_cut
      FROM all_swaps a
      JOIN pools p       ON a.pool = p.pool
      JOIN fee_ranges fr ON fr.pool = a.pool
        AND a.call_block_time >= fr.effective_from
        AND (fr.effective_to IS NULL OR a.call_block_time < fr.effective_to)
    )
    SELECT * FROM priced
  `;

  const rows: any[] = await queryDuneSql(options, sql);

  const dailyFees = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();

  for (const row of rows) {
    const inputMint: string = row.swap0to1 ? row.token_0 : row.token_1;
    const amountIn = Number(row.amount_in);
    if (!amountIn) continue;

    const feeRate = Number(row.fee) / FEE_SCALE;
    const revenueCutFraction = Number(row.revenue_cut) / REVENUE_CUT_SCALE;

    const feeInToken = amountIn * feeRate;
    const protocolCut = feeInToken * revenueCutFraction;
    const lpShare = feeInToken - protocolCut;
    const jupiterShare = protocolCut * JUPITER_SHARE_OF_PROTOCOL;
    const fluidShare = protocolCut - jupiterShare;

    dailyFees.add(inputMint, feeInToken);
    dailySupplySideRevenue.add(inputMint, lpShare + fluidShare);
    dailyRevenue.add(inputMint, jupiterShare);
    dailyProtocolRevenue.add(inputMint, jupiterShare);
  }

  return {
    dailyFees,
    dailySupplySideRevenue,
    dailyRevenue,
    dailyProtocolRevenue,
  };
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.SOLANA],
  start: '2026-06-18',
  dependencies: [Dependencies.DUNE],
  isExpensiveAdapter: true,
  methodology: {
    Fees: "Total swap fees, priced in the input token. Per-swap fee = amount_in x (pool.fee / 1e6) where pool.fee is the value live at the swap's block_time (sourced from init_dex plus every update_fee_and_revenue_cut call, window-joined via effective range). amount_in is exact for swap_in (call arg) and swap_out (LogSwap Anchor event decoded from call_log_messages, u64 LE at byte 11 of the payload).",
    SupplySideRevenue: "LP share of swap fees plus Fluid's protocol share. LP share = fees x (1 - revenue_cut/1e6). Fluid receives 50% of the protocol cut per Jupiter Lend / Fluid arrangement.",
    Revenue: "Jupiter's share of the protocol cut: fees x (revenue_cut/1e6) x 50%.",
    ProtocolRevenue: "Same as Revenue - AMM fees do not feed the JUP buyback.",
  },
};

export default adapter;
