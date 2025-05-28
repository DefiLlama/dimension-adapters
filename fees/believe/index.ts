import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";
import { FetchOptions } from "../../adapters/types";

interface IData {
    total_volume: number;
    total_user_fees: number;
    total_protocol_fees: number;
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
            ),
            launch_coin_swap_txs AS (
                SELECT
                    tx_id
                FROM
                    solana.instruction_calls
                WHERE
                    tx_success = TRUE
                    AND executing_account = 'dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN'
                    AND VARBINARY_STARTS_WITH (data, 0xf8c69e91e17587c8)
                    AND account_arguments[8] IN (SELECT token FROM launch_coin_tokens)
                    AND TIME_RANGE
            ),
            swap_events AS (
                SELECT
                    LEAST(
                        TRY_CAST(BYTEARRAY_TO_UINT256(BYTEARRAY_REVERSE(BYTEARRAY_SUBSTRING(data, 9+90, 8))) AS DECIMAL(38,0)),
                        TRY_CAST(BYTEARRAY_TO_UINT256(BYTEARRAY_REVERSE(BYTEARRAY_SUBSTRING(data, 9+98, 8))) AS DECIMAL(38,0))
                    ) AS event_sol_amount,
                    TRY_CAST(BYTEARRAY_TO_UINT256(BYTEARRAY_REVERSE(BYTEARRAY_SUBSTRING(data, 9+122, 8))) AS DECIMAL(38,0)) AS trading_fee,
                    TRY_CAST(BYTEARRAY_TO_UINT256(BYTEARRAY_REVERSE(BYTEARRAY_SUBSTRING(data, 9+130, 8))) AS DECIMAL(38,0)) AS protocol_fee
                FROM
                    solana.instruction_calls
                WHERE
                    tx_id IN (SELECT tx_id FROM launch_coin_swap_txs)
                    AND tx_success = TRUE
                    AND executing_account = 'dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN'
                    AND VARBINARY_STARTS_WITH (data, 0xe445a52e51cb9a1d)
            )
        SELECT
            SUM(COALESCE(event_sol_amount, 0)) / 1e9 AS total_volume,
            SUM(COALESCE(trading_fee, 0)) / 1e9 AS total_user_fees,
            SUM(COALESCE(protocol_fee, 0)) / 1e9 AS total_protocol_fees
        FROM swap_events
    `
    const data: IData[] = await queryDuneSql(options, query)
    const dailyFees = options.createBalances();
    const dailyRevenue = options.createBalances();

    dailyFees.addCGToken('solana', data[0].total_user_fees);
    dailyRevenue.addCGToken('solana', data[0].total_protocol_fees);
    const dailyUserFees = dailyFees.clone();

    return {
        dailyFees,
        dailyRevenue,
        dailyUserFees
    };
};


const adapter: SimpleAdapter = {
    adapter: {
        [CHAIN.SOLANA]: {
            fetch,
            start: '2025-04-27',
            meta: {
                methodology: {
                    Fees: "Dynamic trading fees paid by users.",
                    Revenue: "Trading fees are collected by Believe protocol."
                }
            }
        }
    },
    version: 1,
    isExpensiveAdapter: true
}

export default adapter
