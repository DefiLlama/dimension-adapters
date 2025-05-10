import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";
import { FetchOptions } from "../../adapters/types";

interface IData {
    total_volume: number;
}

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
    const data: IData[] = await queryDuneSql(options, `
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
                    AND TIME_RANGE
            ),
            launch_coin_swap_txs AS (
            SELECT
                LEAST(
                    BYTEARRAY_TO_UINT256 (BYTEARRAY_REVERSE (BYTEARRAY_SUBSTRING (data, 9, 8))),
                    BYTEARRAY_TO_UINT256 (BYTEARRAY_REVERSE (BYTEARRAY_SUBSTRING (data, 17, 8)))
                ) AS sol_amount
            FROM
                solana.instruction_calls
            WHERE
                tx_success = TRUE
                AND executing_account = 'dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN'
                AND VARBINARY_STARTS_WITH (data, 0xf8c69e91e17587c8)
                AND account_arguments[8] IN (SELECT token FROM launch_coin_tokens)
                AND TIME_RANGE
        )
        SELECT
            SUM(sol_amount) / 1e9 AS total_volume
        FROM launch_coin_swap_txs
    `)
    const dailyVolume = options.createBalances();
    dailyVolume.addCGToken('solana', data[0].total_volume);

    return {
        dailyVolume
    };
};


const adapter: SimpleAdapter = {
    adapter: {
        [CHAIN.SOLANA]: {
            fetch,
            start: '2025-04-27'
        }
    },
    version: 1,
    isExpensiveAdapter: true
}

export default adapter
