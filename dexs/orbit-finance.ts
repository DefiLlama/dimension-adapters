/**
 * CipherDLMM (Orbit Finance) — volume + fees adapter via Dune
 *
 * Program ID: Fn3fA3fjsmpULNL7E9U79jKTe1KHxPtQeWdURCbJXCnM
 * Network:    Solana mainnet
 *
 * Methodology
 *   Volume — For each swap instruction on the CipherDLMM program, we sum the
 *            USD-valued SPL token transfers (via Dune price feeds) and take
 *            the input side (larger of the two transfers) as the swap volume.
 *   Fees   — Difference between input and output USD values per swap.
 *            Fees are embedded in the input amount and retained by the pool's
 *            liquidity bins (not transferred separately).
 */

import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryDuneSql } from "../helpers/dune";

// CipherDLMM program on Solana mainnet
const PROGRAM_ID = "Fn3fA3fjsmpULNL7E9U79jKTe1KHxPtQeWdURCbJXCnM";
// Anchor discriminator for the "swap" instruction: sha256("global:swap")[:8]
const SWAP_DISC = "0xf8c69e91e17587c8";

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
    const query = `
        WITH swap_ixs AS (
            SELECT tx_id, outer_instruction_index
            FROM solana.instruction_calls
            WHERE executing_account = '${PROGRAM_ID}'
                AND bytearray_substring(data, 1, 8) = ${SWAP_DISC}
                AND TIME_RANGE
                AND tx_success = true
        ),
        swap_transfers AS (
            SELECT
                t.tx_id,
                t.outer_instruction_index,
                t.amount_usd
            FROM tokens_solana.transfers t
            JOIN swap_ixs s
                ON t.tx_id = s.tx_id
                AND t.outer_instruction_index = s.outer_instruction_index
            WHERE t.block_time >= from_unixtime(${options.startTimestamp})
                AND t.block_time <= from_unixtime(${options.endTimestamp})
                AND t.amount_usd IS NOT NULL
                AND t.amount_usd > 0
        ),
        per_swap AS (
            SELECT
                tx_id,
                outer_instruction_index,
                MAX(amount_usd) AS input_usd,
                MIN(amount_usd) AS output_usd
            FROM swap_transfers
            GROUP BY tx_id, outer_instruction_index
        )
        SELECT
            COALESCE(SUM(input_usd), 0) AS daily_volume,
            COALESCE(SUM(input_usd - output_usd), 0) AS daily_fees
        FROM per_swap
    `;

    const data = await queryDuneSql(options, query);

    return {
        dailyVolume: data[0]?.daily_volume ?? 0,
        dailyFees: data[0]?.daily_fees ?? 0,
    };
};

const adapter: SimpleAdapter = {
    fetch,
    dependencies: [Dependencies.DUNE],
    chains: [CHAIN.SOLANA],
    start: "2025-01-01",
    isExpensiveAdapter: true,
    methodology: {
        Volume:
            "For each swap on the CipherDLMM program, the input-side USD value (from Dune token price feeds) is counted as volume.",
        Fees:
            "Difference between input and output USD values per swap. The fee is retained by the pool's concentrated-liquidity bins.",
    },
};

export default adapter;
