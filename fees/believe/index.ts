import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";
import { FetchOptions } from "../../adapters/types";

interface IData {
    total_volume: number;
}

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
    const query = `
        WITH tokens as (
            SELECT
                block_time as ts,
                account_arguments[4] as token
            FROM solana.instruction_calls
            WHERE block_time >= timestamp '2025-04-27'
                AND executing_account = 'dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN'
                AND tx_signer = '5qWya6UjwWnGVhdSBL3hyZ7B45jbk6Byt1hwd7ohEGXE'
                AND account_arguments[4] <> 'So11111111111111111111111111111111111111112'
                AND tx_success
                AND not is_inner

            UNION ALL

            SELECT
                block_time as ts,
                account_arguments[6] as token
            FROM solana.instruction_calls
            WHERE block_time >= timestamp '2025-04-27'
                AND executing_account = 'SQDS4ep65T869zMMBKyuUq6aD6EgTu8psMjkvj52pCf'
                AND tx_signer = '5qWya6UjwWnGVhdSBL3hyZ7B45jbk6Byt1hwd7ohEGXE'
                AND VARBINARY_STARTS_WITH (data, 0xc208a15799a419ab)
                AND account_arguments[6] <> 'So11111111111111111111111111111111111111112'
                AND tx_success
                AND not is_inner
            
        ), volumes as (
            SELECT token_bought_mint_address, token_bought_amount_raw, amount_usd, tx_id
            FROM dex_solana.trades
            WHERE TIME_RANGE
                AND (
                    token_bought_mint_address in (SELECT token FROM tokens)
                    or
                    token_sold_mint_address in (SELECT token FROM tokens)
                )
        )

        SELECT sum(amount_usd) as total_volume from volumes
    `
    const data: IData[] = await queryDuneSql(options, query)
    const dailyFees = options.createBalances();

    const volume = Number(data[0].total_volume)

    // 2% trading volume
    dailyFees.addUSDValue(volume * 0.02);

    // 100% fees
    const dailyUserFees = dailyFees.clone();

    // 30% fees
    const dailyRevenue = dailyFees.clone(0.3);

    return {
        dailyFees,
        dailyUserFees,
        dailyRevenue,
        dailyProtocolRevenue: dailyRevenue,
    };
};


const adapter: SimpleAdapter = {
    adapter: {
        [CHAIN.SOLANA]: {
            fetch,
            start: '2025-04-27',
            meta: {
                methodology: {
                    Fees: "2% swap fees paid by users.",
                    UserFees: "User pay 2% per swap.",
                    Revenue: "30% trading fees collected by Believe protocol."
                }
            }
        }
    },
    version: 1,
    isExpensiveAdapter: true
}

export default adapter
