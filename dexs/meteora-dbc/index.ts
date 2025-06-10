import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";
import { FetchOptions } from "../../adapters/types";

interface IData {
    total_volume: number;
    total_trading_fees: number;
    total_protocol_fees: number;
    total_referral_fees: number;
}

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
    const data: IData[] = await queryDuneSql(options, `
        WITH
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
                    AND tx_success = TRUE
                    AND VARBINARY_STARTS_WITH (data, 0xe445a52e51cb9a1d1b3c15d58aaabb93)
                    AND TIME_RANGE
            )
        SELECT
            SUM(
                CASE 
                    WHEN trade_direction = 1 THEN COALESCE(actual_input_amount, 0)
                    ELSE COALESCE(output_amount, 0)
                END
            ) / 1e9 AS total_volume,
            SUM(
                CASE 
                    WHEN trade_direction = 1 AND trading_fee <= actual_input_amount THEN COALESCE(trading_fee, 0)
                    WHEN trade_direction != 1 AND trading_fee <= output_amount THEN COALESCE(trading_fee, 0)
                    ELSE 0
                END
            ) / 1e9 AS total_trading_fees,
            SUM(
                CASE 
                    WHEN trade_direction = 1 AND protocol_fee <= actual_input_amount THEN COALESCE(protocol_fee, 0)
                    WHEN trade_direction != 1 AND protocol_fee <= output_amount THEN COALESCE(protocol_fee, 0)
                    ELSE 0
                END
            ) / 1e9 AS total_protocol_fees,
            SUM(
                CASE 
                    WHEN trade_direction = 1 AND referral_fee <= actual_input_amount THEN COALESCE(referral_fee, 0)
                    WHEN trade_direction != 1 AND referral_fee <= output_amount THEN COALESCE(referral_fee, 0)
                    ELSE 0
                END
            ) / 1e9 AS total_referral_fees
        FROM swap_events
    `)
    const dailyVolume = options.createBalances();
    const dailyFees = options.createBalances();
    const dailyProtocolFees = options.createBalances();
    
    dailyVolume.addCGToken('solana', data[0].total_volume);
    dailyFees.addCGToken('solana', data[0].total_trading_fees + data[0].total_protocol_fees + data[0].total_referral_fees);
    dailyProtocolFees.addCGToken('solana', data[0].total_protocol_fees);

    return {
        dailyVolume,
        dailyFees,
        dailyUserFees: dailyFees,
        dailyRevenue: dailyProtocolFees,
        dailyProtocolRevenue: dailyProtocolFees,
    };
};


const adapter: SimpleAdapter = {
    version: 1,
    adapter: {
        [CHAIN.SOLANA]: {
            fetch,
            start: '2025-04-23',
            meta: {
                methodology: {
                    Fees: "Trading fees paid by users",
                    Revenue: "Protocol fees collected by Meteora DBC protocol"
                }
            }
        }
    },
    isExpensiveAdapter: true
}

export default adapter