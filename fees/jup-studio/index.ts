import { Dependencies, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";
import { FetchOptions } from "../../adapters/types";

interface IData {
    quote_mint: string;
    total_volume: number;
    total_trading_fees: number;
    total_protocol_fees: number;
    total_referral_fees: number;
    damm_v2_fees: number;
}

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
    const query = `
        WITH
            dbc_tokens AS (
                SELECT
                    account_config,
                    account_quote_mint,
                    call_tx_signer,
                    CAST(JSON_EXTRACT_SCALAR(config_parameters, '$.ConfigParameters.collect_fee_mode') AS INT) AS collect_fee_mode
                FROM meteora_solana.dynamic_bonding_curve_call_create_config
                WHERE call_executing_account = 'dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN'
                    AND cardinality(call_account_arguments) = 9
                    AND call_account_arguments[9] = '8rE9CtCjwhSmbwL5fbJBtRFsS3ohfMcDFeTTC7t4ciUA'
            ),
            swap_events AS (
                SELECT
                    s.config,
                    s.trade_direction,
                    s.amount_in,
                    s.swap_result,
                    t.account_quote_mint,
                    t.collect_fee_mode,
                    CAST(JSON_EXTRACT_SCALAR(s.swap_result, '$.SwapResult.trading_fee') AS DECIMAL(38,0)) AS trading_fee,
                    CAST(JSON_EXTRACT_SCALAR(s.swap_result, '$.SwapResult.protocol_fee') AS DECIMAL(38,0)) AS protocol_fee,
                    CAST(JSON_EXTRACT_SCALAR(s.swap_result, '$.SwapResult.referral_fee') AS DECIMAL(38,0)) AS referral_fee,
                    CAST(JSON_EXTRACT_SCALAR(s.swap_result, '$.SwapResult.output_amount') AS DECIMAL(38,0)) AS amount_out
                FROM meteora_solana.dynamic_bonding_curve_evt_evtswap s
                JOIN dbc_tokens t ON s.config = t.account_config
                WHERE s.evt_executing_account = 'dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN'
                    AND s.evt_block_time >= from_unixtime(${options.startTimestamp})
                    AND s.evt_block_time < from_unixtime(${options.endTimestamp})
            ),
            damm_v2_fees AS (
                SELECT
                    evt_tx_id,
                    evt_outer_instruction_index,
                    evt_inner_instruction_index
                FROM meteora_solana.cp_amm_evt_evtclaimpositionfee
                WHERE owner = 'CWcERiVd7xkUrcJK5QBdcKC5GG8JMATMLNHtCEUguwPz'
                    AND evt_block_time >= from_unixtime(${options.startTimestamp})
                    AND evt_block_time < from_unixtime(${options.endTimestamp})
            ),
            damm_v2_token_transfers AS (
                SELECT
                    t.token_mint_address,
                    SUM(t.amount) AS total_amount
                FROM tokens_solana.transfers t
                INNER JOIN damm_v2_fees d ON t.tx_id = d.evt_tx_id
                    AND t.outer_instruction_index = d.evt_outer_instruction_index
                    AND t.inner_instruction_index = d.evt_inner_instruction_index - 1
                WHERE t.block_time >= from_unixtime(${options.startTimestamp})
                    AND t.block_time < from_unixtime(${options.endTimestamp})
                GROUP BY t.token_mint_address
            )
        SELECT
            account_quote_mint as quote_mint,
            SUM(
                CASE 
                    WHEN trade_direction = 1 THEN COALESCE(amount_in, 0)
                    ELSE COALESCE(amount_out, 0)
                END
            ) AS total_volume,
            SUM(
                CASE 
                    WHEN collect_fee_mode = 1 AND trade_direction = 1 THEN 0
                    ELSE COALESCE(trading_fee, 0)
                END
            ) AS total_trading_fees,
            SUM(
                CASE 
                    WHEN collect_fee_mode = 1 AND trade_direction = 1 THEN 0
                    ELSE COALESCE(protocol_fee, 0)
                END
            ) AS total_protocol_fees,
            SUM(
                CASE 
                    WHEN collect_fee_mode = 1 AND trade_direction = 1 THEN 0
                    ELSE COALESCE(referral_fee, 0)
                END
            ) AS total_referral_fees,
            CAST(0 AS DECIMAL(38,0)) AS damm_v2_fees
        FROM swap_events
        GROUP BY account_quote_mint
        UNION ALL
        SELECT
            token_mint_address as quote_mint,
            CAST(0 AS DECIMAL(38,0)) AS total_volume,
            CAST(0 AS DECIMAL(38,0)) AS total_trading_fees,
            CAST(0 AS DECIMAL(38,0)) AS total_protocol_fees,
            CAST(0 AS DECIMAL(38,0)) AS total_referral_fees,
            total_amount AS damm_v2_fees
        FROM damm_v2_token_transfers
    `
    const data: IData[] = await queryDuneSql(options, query)

    const dailyFees = options.createBalances();
    const dailySupplySideRevenue = options.createBalances();
    const dailyProtocolRevenue = options.createBalances();

    const accepted_quote_mints = [
        'So11111111111111111111111111111111111111112',
        'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
        'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN'
    ]
    console.log(data);
    data.forEach(row => {
        if (!accepted_quote_mints.includes(row.quote_mint)) return;
        const totalFees = Number(row.total_protocol_fees) + Number(row.total_referral_fees) + Number(row.total_trading_fees) + Number(row.damm_v2_fees);
        dailyFees.add(row.quote_mint, Number(totalFees));
        dailySupplySideRevenue.add(row.quote_mint, Number(row.total_referral_fees));
        dailyProtocolRevenue.add(row.quote_mint, Number(row.total_trading_fees) + Number(row.damm_v2_fees));
    });

    return {
        dailyFees,
        dailyUserFees: dailyFees,
        dailyRevenue: dailyProtocolRevenue,
        dailyProtocolRevenue,
        dailySupplySideRevenue,
    };
};

const adapter: SimpleAdapter = {
    version: 1,
    fetch,
    chains: [CHAIN.SOLANA],
    dependencies: [Dependencies.DUNE],
    start: '2025-07-02',
    isExpensiveAdapter: true,
    methodology: {
        Fees: "Trading fees paid by users.",
        Revenue: "Fees collected by Jup Studio.",
        ProtocolRevenue: "Fees collected by Jup Studio.",
        SupplySideRevenue: "Fees collected by referrals.",
    }
}

export default adapter
