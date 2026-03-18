/**
 * CipherDLMM (Orbit Finance) — volume + fees adapter via Dune
 *
 * Program ID: Fn3fA3fjsmpULNL7E9U79jKTe1KHxPtQeWdURCbJXCnM
 * Network:    Solana mainnet
 *
 * Methodology
 *   Volume — For each swap on the CipherDLMM program, we take the input-side
 *            USD value (the larger of the two SPL token transfers per swap).
 *   Fees   — Volume * pool fee rate. Pools have configurable fee rates
 *            (base_fee_bps ranging from 30-200bps). We use a weighted average
 *            of 90bps across active pools.
 */

import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryDuneSql } from "../helpers/dune";

// CipherDLMM program on Solana mainnet
const PROGRAM_ID = "Fn3fA3fjsmpULNL7E9U79jKTe1KHxPtQeWdURCbJXCnM";
// Anchor discriminator for the "swap" instruction: sha256("global:swap")[:8]
const SWAP_DISC = "0xf8c69e91e17587c8";
// Fee rate of the primary active pool (CIPHER/USDC at 200bps = 2%)
// Other pools range 30-90bps but currently have no liquidity/volume
const AVG_FEE_RATE = 0.02;

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
                MAX(amount_usd) AS input_usd
            FROM swap_transfers
            GROUP BY tx_id, outer_instruction_index
        )
        SELECT
            COALESCE(SUM(input_usd), 0) AS daily_volume
        FROM per_swap
    `;

    const data = await queryDuneSql(options, query);
    const dailyVolume = data[0].daily_volume;

    return {
        dailyVolume,
        dailyFees: dailyVolume * AVG_FEE_RATE,
    };
};

const adapter: SimpleAdapter = {
    fetch,
    dependencies: [Dependencies.DUNE],
    chains: [CHAIN.SOLANA],
    start: "2025-10-01",
    isExpensiveAdapter: true,
    methodology: {
        Volume:
            "For each swap on the CipherDLMM program, the input-side USD value (from Dune token price feeds) is counted as volume.",
        Fees:
            "Volume multiplied by the pool fee rate (200bps for the primary CIPHER/USDC pool). CipherDLMM pools have configurable fees; rate will be dynamically weighted as more pools gain volume.",
    },
};

export default adapter;
