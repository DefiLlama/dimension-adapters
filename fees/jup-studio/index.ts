import ADDRESSES from '../../helpers/coreAssets.json'
import { Dependencies, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";
import { FetchOptions } from "../../adapters/types";
import { JUPITER_METRICS, jupBuybackRatioFromRevenue } from "../jupiter";

// Studio's Meteora DBC configs, selected by fee claimer (fixed at config creation) like the other DBC launchpads. Studio
// creates one config per token, in the pool's tx, and serves the token's metadata at static-create.jup.ag/metadata/<mint>.json.
// Fee split: https://docs.jup.ag/user-docs/launch/studio/graduation-and-fees. The claimer also owns Jupiter's DAMM v2 LP
// position in graduated pools and claims its fees.
const JUP_STUDIO_FEE_CLAIMERS = [
    // configs until 2026-09-11, DAMM v2 claims until 2026-09-06, e.g.
    // tx 2CMPtwU8cShUGzSTaWqK98ULEAuP3fxcUZ6ojK1xHCvYdiV3UBSfBxA9DhHdXKzXYzJ7n9kE2D97y9ZR9AeSuzE2
    'CWcERiVd7xkUrcJK5QBdcKC5GG8JMATMLNHtCEUguwPz',
    // configs and DAMM v2 claims since 2026-09-11, e.g. config + pool (mint Fq7UtHiUtw2Qb2eBXm4NyAZtpkgHkbQnuqAWUAv5jupx)
    // tx kFR7opdiXi9YmFV1Q6v8LMx7E3TizVrMAPQqxwDkMZqhpJKh6aRfA2M8smo259CxuAhykGHDDFur98NxeUNP5md, claim
    // tx 3aF2VShxfeboi165Kze5KAWjbYph7cmRMXi8ZmSNuPijefvw1kz1feufuFnZu8gyyn6qByHyA9vYLenDzXbDydhZ
    'E8QjCz3aX31Qk6ieEYzfVsfqmT3dbTaTEABwUUgZVGWL',
]
// The old key, 9th create_config account 8rE9CtCjwhSmbwL5fbJBtRFsS3ohfMcDFeTTC7t4ciUA, is not Studio's: Studio configs
// dropped it on 2026-09-21, and other claimers' configs pass it, e.g. 8TPACXaKotSZ7WXktfmKDRhgoypyGXNzo1ctr2YBzxLc since
// 2026-03-27 (creator share 0%, no Studio metadata), config
// tx 4tfXw1yveD4GzfwnqAvTVLwqggP4NBbtxjdp2bE1rYpSHThETptq4pk59XoTqCvyPPNVnJ2Z5z75MiCM8LBhSEQK
const FEE_CLAIMERS_SQL = JUP_STUDIO_FEE_CLAIMERS.map((a) => `'${a}'`).join(', ')

const LABELS = {
    TRADING_FEES_TO_CREATORS: 'Jup Studio Trading Fees To Creators',
    TRADING_FEES_TO_METEORA: 'Jup Studio Trading Fees To Meteora',
}

interface IData {
    quote_mint: string;
    total_volume: number;
    total_trading_fees: number;
    total_protocol_fees: number;
    total_referral_fees: number;
    total_creator_fees: number;
    damm_v2_fees: number;
}

const fetch = async (options: FetchOptions) => {
    const query = `
        WITH
            dbc_tokens AS (
                SELECT
                    account_config,
                    account_quote_mint,
                    call_tx_signer,
                    CAST(JSON_EXTRACT_SCALAR(config_parameters, '$.ConfigParameters.collect_fee_mode') AS INT) AS collect_fee_mode,
                    COALESCE(CAST(JSON_EXTRACT_SCALAR(config_parameters, '$.ConfigParameters.creator_trading_fee_percentage') AS INT), 0) AS creator_fee_pct
                FROM meteora_solana.dynamic_bonding_curve_call_create_config
                WHERE call_executing_account = 'dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN'
                    AND account_fee_claimer IN (${FEE_CLAIMERS_SQL})
            ),
            swap_events AS (
                SELECT
                    s.config,
                    s.trade_direction,
                    s.amount_in,
                    s.swap_result,
                    t.account_quote_mint,
                    t.collect_fee_mode,
                    t.creator_fee_pct,
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
                WHERE owner IN (${FEE_CLAIMERS_SQL})
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
            SUM(
                CASE
                    WHEN collect_fee_mode = 1 AND trade_direction = 1 THEN 0
                    ELSE COALESCE(trading_fee, 0) * creator_fee_pct / 100
                END
            ) AS total_creator_fees,
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
            CAST(0 AS DECIMAL(38,0)) AS total_creator_fees,
            total_amount AS damm_v2_fees
        FROM damm_v2_token_transfers
    `
    const data: IData[] = await queryDuneSql(options, query)
    // Studio pools trade every day: an empty result is missing Dune data, not a zero day
    if (!data.length) throw new Error(`No Jup Studio swaps or fee claims found on Dune for ${options.dateString}`)

    const dailyFees = options.createBalances();
    const dailySupplySideRevenue = options.createBalances();
    const dailyRevenue = options.createBalances();
    const dailyProtocolRevenue = options.createBalances();
    const dailyHoldersRevenue = options.createBalances();

    const accepted_quote_mints = [
        ADDRESSES.solana.SOL,
        ADDRESSES.solana.USDC,
        ADDRESSES.solana.JUP
    ]
    data.forEach(row => {
        if (!accepted_quote_mints.includes(row.quote_mint)) return;
        const totalFees = Number(row.total_protocol_fees) + Number(row.total_referral_fees) + Number(row.total_trading_fees) + Number(row.damm_v2_fees);

        dailyFees.add(row.quote_mint, Number(totalFees), JUPITER_METRICS.JupStudioFees);
        dailySupplySideRevenue.add(row.quote_mint, Number(row.total_referral_fees), JUPITER_METRICS.JupStudioFeesToReferrals);
        // the config's creator share of the trading fee goes to the token creator, the protocol fee to Meteora
        dailySupplySideRevenue.add(row.quote_mint, Number(row.total_creator_fees), LABELS.TRADING_FEES_TO_CREATORS);
        dailySupplySideRevenue.add(row.quote_mint, Number(row.total_protocol_fees), LABELS.TRADING_FEES_TO_METEORA);

        const revenue = options.createBalances();
        revenue.add(row.quote_mint, Number(row.total_trading_fees) - Number(row.total_creator_fees) + Number(row.damm_v2_fees))
        dailyRevenue.add(revenue, JUPITER_METRICS.JupStudioFeesToJupiter);
      
        const buybackRatio = jupBuybackRatioFromRevenue(options.startOfDay);
        const revenueHolders = revenue.clone(buybackRatio);
        const revenueProtocol = revenue.clone(1 - buybackRatio);
        dailyProtocolRevenue.add(revenueProtocol, JUPITER_METRICS.JupStudioFeesToJupiter);
        dailyHoldersRevenue.add(revenueHolders, JUPITER_METRICS.TokenBuyBack);
    });

    return {
        dailyFees,
        dailyUserFees: dailyFees,
        dailyRevenue,
        dailyProtocolRevenue,
        dailySupplySideRevenue,
        dailyHoldersRevenue,
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
        Fees: "Trading fees paid by users on Jup Studio bonding curves, and the fees Jupiter's LP position earns in graduated Meteora DAMM v2 pools, counted when claimed.",
        Revenue: "Jup Studio's share of bonding-curve trading fees (after the token creator's share) and its fees from migrated DAMM v2 pools.",
        SupplySideRevenue: "Fees paid to referrals, to token creators (their configured share of the trading fee) and to Meteora (its protocol fee).",
        ProtocolRevenue: 'Share of 50% fees collected by protocol, it was 100% before 2025-02-17.',
        HoldersRevenue: 'From 2025-02-17, share of 50% fees to buy back JUP tokens.',
    },
    breakdownMethodology: {
        Fees: {
            [JUPITER_METRICS.JupStudioFees]: "Bonding-curve trading fees (creator, Jupiter, Meteora and referral shares) plus the DAMM v2 LP fees Jupiter claims.",
        },
        Revenue: {
            [JUPITER_METRICS.JupStudioFeesToJupiter]: "Jup Studio's share of trading fees, after the creator share, plus DAMM v2 position fees it claims.",
        },
        ProtocolRevenue: {
            [JUPITER_METRICS.JupStudioFeesToJupiter]: 'Share of 50% fees collected by protocol, it was 100% before 2025-02-17.',
        },
        SupplySideRevenue: {
            [JUPITER_METRICS.JupStudioFeesToReferrals]: 'Fees collected by referrals.',
            [LABELS.TRADING_FEES_TO_CREATORS]: "The token creator's configured share of the bonding-curve trading fee.",
            [LABELS.TRADING_FEES_TO_METEORA]: "Meteora's protocol fee on bonding-curve swaps.",
        },
        HoldersRevenue: {
            [JUPITER_METRICS.TokenBuyBack]: 'From 2025-02-17, share of 50% fees to buy back JUP tokens.',
        },
    }
}

export default adapter
