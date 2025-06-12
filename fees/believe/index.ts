import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";
import { FetchOptions } from "../../adapters/types";

interface IData {
    total_volume: number;
    total_fees: number;
}

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
    const query = `
        WITH
            launch_coin_tokens AS (
                SELECT DISTINCT
                    account_arguments[4] AS token
                FROM
                    solana.instruction_calls
                WHERE
                    executing_account = 'dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN'
                    AND tx_signer = '5qWya6UjwWnGVhdSBL3hyZ7B45jbk6Byt1hwd7ohEGXE'
                    AND account_arguments[4] <> 'So11111111111111111111111111111111111111112'
                    AND tx_success = TRUE
                    AND NOT is_inner

                UNION

                SELECT DISTINCT
                    account_arguments[6] AS token
                FROM
                    solana.instruction_calls
                WHERE
                    executing_account = 'SQDS4ep65T869zMMBKyuUq6aD6EgTu8psMjkvj52pCf'
                    AND tx_signer = '5qWya6UjwWnGVhdSBL3hyZ7B45jbk6Byt1hwd7ohEGXE'
                    AND tx_success = TRUE
                    AND VARBINARY_STARTS_WITH (data, 0xc208a15799a419ab)
                    AND account_arguments[6] <> 'So11111111111111111111111111111111111111112'
                    AND NOT is_inner
            ),
            launch_coin_swap_txs_for_event_join AS (
                SELECT
                    tx_id
                FROM
                    solana.instruction_calls
                WHERE
                    executing_account = 'dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN'
                    AND TIME_RANGE
                    AND tx_success = TRUE
                    AND VARBINARY_STARTS_WITH (data, 0xf8c69e91e17587c8)
                    AND account_arguments[8] IN (SELECT token FROM launch_coin_tokens)
            ),
            swap_events AS (
                SELECT
                    TRY_CAST(BYTEARRAY_TO_UINT256(BYTEARRAY_SUBSTRING(data, 17+64, 1)) AS INT) AS trade_direction,
                    TRY_CAST(BYTEARRAY_TO_UINT256(BYTEARRAY_REVERSE(BYTEARRAY_SUBSTRING(data, 17+82, 8))) AS DECIMAL(38,0)) AS actual_input_amount,
                    TRY_CAST(BYTEARRAY_TO_UINT256(BYTEARRAY_REVERSE(BYTEARRAY_SUBSTRING(data, 17+90, 8))) AS DECIMAL(38,0)) AS output_amount,
                    TRY_CAST(BYTEARRAY_TO_UINT256(BYTEARRAY_REVERSE(BYTEARRAY_SUBSTRING(data, 17+114, 8))) AS DECIMAL(38,0)) AS trading_fee,
                    TRY_CAST(BYTEARRAY_TO_UINT256(BYTEARRAY_REVERSE(BYTEARRAY_SUBSTRING(data, 17+122, 8))) AS DECIMAL(38,0)) AS protocol_fee,
                    TRY_CAST(BYTEARRAY_TO_UINT256(BYTEARRAY_REVERSE(BYTEARRAY_SUBSTRING(data, 17+130, 8))) AS DECIMAL(38,0)) AS referral_fee
                FROM
                    solana.instruction_calls
                WHERE
                    executing_account = 'dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN'
                    AND TIME_RANGE
                    AND tx_success = TRUE
                    AND tx_id IN (SELECT tx_id FROM launch_coin_swap_txs_for_event_join)
                    AND VARBINARY_STARTS_WITH (data, 0xe445a52e51cb9a1d1b3c15d58aaabb93)
            )
        SELECT
            SUM(
                CASE 
                    WHEN trade_direction = 1 THEN COALESCE(actual_input_amount, 0)  -- Buy: SOL in
                    ELSE COALESCE(output_amount, 0)  -- Sell: SOL out
                END
            ) / 1e9 AS total_volume,
            SUM(
                CASE 
                    WHEN trade_direction = 1 AND trading_fee <= actual_input_amount THEN COALESCE(trading_fee, 0)
                    WHEN trade_direction != 1 AND trading_fee <= output_amount THEN COALESCE(trading_fee, 0)
                    ELSE 0
                END
            ) / 1e9 AS total_fees
        FROM swap_events
    `
    const data: IData[] = await queryDuneSql(options, query)
    // const dailyVolume = options.createBalances();
    const dailyFees = options.createBalances();

    // dailyVolume.addCGToken('solana', data[0].total_volume);
    dailyFees.addCGToken('solana', data[0].total_fees);

    // 30% fees (assuming protocol keeps 30% of total fees)
    const dailyRevenue = dailyFees.clone(0.3);

    return {
        dailyFees,
        dailyUserFees: dailyFees,
        dailyRevenue,
        dailyProtocolRevenue: dailyRevenue,
    };
};


const adapter: SimpleAdapter = {
    version: 1,
    adapter: {
        [CHAIN.SOLANA]: {
            fetch,
            start: '2025-04-27',
            meta: {
                methodology: {
                    Fees: "Trading fees (trading fee) extracted from Meteora DBC swap events.",
                    UserFees: "All fees paid by users during swaps on Believe platform.",
                    Revenue: "30% of total fees collected by Believe protocol."
                }
            }
        }
    },
    isExpensiveAdapter: true
}

export default adapter
