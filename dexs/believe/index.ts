import ADDRESSES from '../../helpers/coreAssets.json'
import { Dependencies, SimpleAdapter } from "../../adapters/types";
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
                    AND account_arguments[4] <> '${ADDRESSES.solana.SOL}'
                    AND tx_success = TRUE
                    AND NOT is_inner
            ),
            launch_coin_swap_txs_for_event_join AS (
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
                    ) AS event_sol_amount
                FROM
                    solana.instruction_calls
                WHERE
                    tx_id IN (SELECT tx_id FROM launch_coin_swap_txs_for_event_join)
                    AND tx_success = TRUE
                    AND executing_account = 'dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN'
                    AND VARBINARY_STARTS_WITH (data, 0xe445a52e51cb9a1d)
                    AND TIME_RANGE
            )
        SELECT
            SUM(COALESCE(event_sol_amount, 0)) / 1e9 AS total_volume
        FROM swap_events
    `)
    const dailyVolume = options.createBalances();
    dailyVolume.addCGToken('solana', data[0].total_volume);

    return {
        dailyVolume
    };
};


const adapter: SimpleAdapter = {
    version: 1,
    dependencies: [Dependencies.DUNE],
    adapter: {
        [CHAIN.SOLANA]: {
            fetch,
            start: '2025-04-27'
        }
    },
    isExpensiveAdapter: true
}

export default adapter
