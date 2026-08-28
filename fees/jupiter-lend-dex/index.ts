import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";

// Fees = per-swap (leg notional * fee_at_that_time / 1e6), priced in that leg's token.
// Fee history is init_dex ∪ every subsequent update_fee_and_revenue_cut call, window-joined
// on block_time so a swap always uses the fee that was live when it executed.
//
// Leg valued:
// - swap_in (exact-in): input leg, from the amount_in call argument.
// - swap_out (exact-out): output leg, from the amount_out call argument.
//
// Pool token identity comes from the swap calls, NOT from init_dex: init_dex decodes
// account_token_1 as the system program for the oldest pool (the USDC/USDT pool, which
// is ~98% of all swaps), which would send half that pool's fees to an unpriceable mint.
// init_dex is kept as the fallback for pools that have never traded.
//
// Revenue split: LP = fee * (1 - revenue_cut/1e6). Protocol = fee * revenue_cut/1e6.
// Jupiter and Fluid share the protocol cut 50/50. AMM fees do NOT feed the JUP buyback.

const FEE_SCALE = 1e6;            // fee arg is in ppm (u32 in IDL)
const REVENUE_CUT_SCALE = 1e6;    // revenue_cut arg is in ppm (u32 in IDL)
const JUPITER_SHARE_OF_PROTOCOL = 0.5;

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
    rate_events AS (
      SELECT
        account_dex AS pool,
        call_block_time,
        CAST(json_extract_scalar(params, '$.InitDexParams.fee') AS BIGINT)         AS fee,
        CAST(json_extract_scalar(params, '$.InitDexParams.revenue_cut') AS BIGINT) AS revenue_cut
      FROM jupiter_lend_solana.dex_call_init_dex
      UNION ALL
      SELECT account_dex, call_block_time, fee, revenue_cut
      FROM jupiter_lend_solana.dex_call_update_fee_and_revenue_cut
    ),
    rates AS (
      SELECT
        pool, fee, revenue_cut,
        call_block_time                                                        AS effective_from,
        LEAD(call_block_time) OVER (PARTITION BY pool ORDER BY call_block_time) AS effective_to
      FROM rate_events
    ),
    swaps AS (
      SELECT account_dex AS pool, call_block_time, swap0to1, TRUE AS is_exact_in,
             CAST(amount_in AS DOUBLE) AS amount
      FROM jupiter_lend_solana.dex_call_swap_in
      WHERE call_block_time >= from_unixtime(${options.startTimestamp})
        AND call_block_time <  from_unixtime(${options.endTimestamp})
      UNION ALL
      SELECT account_dex, call_block_time, swap0to1, FALSE,
             CAST(amount_out AS DOUBLE)
      FROM jupiter_lend_solana.dex_call_swap_out
      WHERE call_block_time >= from_unixtime(${options.startTimestamp})
        AND call_block_time <  from_unixtime(${options.endTimestamp})
    )
    SELECT
      CASE WHEN s.is_exact_in
           THEN CASE WHEN s.swap0to1 THEN p.token_0 ELSE p.token_1 END
           ELSE CASE WHEN s.swap0to1 THEN p.token_1 ELSE p.token_0 END
      END                                                                  AS mint,
      SUM(s.amount * r.fee / ${FEE_SCALE})                                 AS fee_amount,
      SUM(s.amount * r.fee / ${FEE_SCALE} * r.revenue_cut / ${REVENUE_CUT_SCALE})
                                                                           AS protocol_cut_amount
    FROM swaps s
    JOIN pools p ON s.pool = p.pool
    JOIN rates r ON r.pool = s.pool
      AND s.call_block_time >= r.effective_from
      AND (r.effective_to IS NULL OR s.call_block_time < r.effective_to)
    GROUP BY 1
  `;

  const rows: any[] = await queryDuneSql(options, sql);

  const dailyFees = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();

  for (const row of rows) {
    const feeInToken = Number(row.fee_amount);
    if (!feeInToken) continue;

    const protocolCut = Number(row.protocol_cut_amount);
    const lpShare = feeInToken - protocolCut;
    const jupiterShare = protocolCut * JUPITER_SHARE_OF_PROTOCOL;
    const fluidShare = protocolCut - jupiterShare;

    dailyFees.add(row.mint, feeInToken, "Jupiter Lend Dex Swap Fees");
    dailySupplySideRevenue.add(row.mint, lpShare, "Jupiter Lend Dex Swap Fees to LPs");
    dailySupplySideRevenue.add(row.mint, fluidShare, "Jupiter Lend Dex Swap Fees to Fluid");
    dailyRevenue.add(row.mint, jupiterShare, "Jupiter Lend Dex Swap Fees to Protocol");
    dailyProtocolRevenue.add(row.mint, jupiterShare, "Jupiter Lend Dex Swap Fees to Protocol");
  }

  return {
    dailyFees,
    dailySupplySideRevenue,
    dailyRevenue,
    dailyProtocolRevenue,
  };
};

const breakdownMethodology = {
  Fees: {
    "Jupiter Lend Dex Swap Fees": "Total swap fees, priced in the valued leg's token.",
  },
  Revenue: {
    "Jupiter Lend Dex Swap Fees to Protocol": "Jupiter's share of the protocol cut: fees x (revenue_cut/1e6) x 50%.",
  },
  ProtocolRevenue: {
    "Jupiter Lend Dex Swap Fees to Protocol": "Jupiter's share of the protocol cut: fees x (revenue_cut/1e6) x 50%.",
  },
  SupplySideRevenue: {
    "Jupiter Lend Dex Swap Fees to LPs": "LP share of swap fees. LP share = fees x (1 - revenue_cut/1e6).",
    "Jupiter Lend Dex Swap Fees to Fluid": "Fluid's share of the protocol cut: fees x (revenue_cut/1e6) x 50%.",
  }
}

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.SOLANA],
  start: '2026-06-22',
  dependencies: [Dependencies.DUNE],
  isExpensiveAdapter: true,
  methodology: {
    Fees: "Total swap fees, priced in the valued leg's token. Per-swap fee = amount x (pool.fee / 1e6) where pool.fee is the value live at the swap's block_time (sourced from init_dex plus every update_fee_and_revenue_cut call, window-joined via effective range). Exact-in swaps are valued on the input leg (amount_in call argument), exact-out swaps on the output leg (amount_out call argument). Per-pool token identity comes from the swap calls, with dex_call_init_dex as a fallback for pools that have never traded.",
    SupplySideRevenue: "LP share of swap fees plus Fluid's protocol share. LP share = fees x (1 - revenue_cut/1e6). Fluid receives 50% of the protocol cut per Jupiter Lend / Fluid arrangement.",
    Revenue: "Jupiter's share of the protocol cut: fees x (revenue_cut/1e6) x 50%.",
    ProtocolRevenue: "Jupiter's share of the protocol cut: fees x (revenue_cut/1e6) x 50%.",
  },
  breakdownMethodology,
};

export default adapter;
