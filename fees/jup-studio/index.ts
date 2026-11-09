import ADDRESSES from '../../helpers/coreAssets.json'
import { Dependencies, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";
import { FetchOptions } from "../../adapters/types";
import { JUPITER_METRICS } from "../jupiter";

// Studio's Meteora DBC configs, selected by fee claimer (fixed at config creation). Studio creates one config per token,
// in the pool's tx. Fee split: https://docs.jup.ag/user-docs/launch/studio/graduation-and-fees. At graduation the DBC
// program assigns the partner's DAMM v2 LP position NFT to the fee claimer, so the same keys own Jupiter's LP positions.
const JUP_STUDIO_FEE_CLAIMERS = [
    'CWcERiVd7xkUrcJK5QBdcKC5GG8JMATMLNHtCEUguwPz', // configs until 2026-09-11
    'E8QjCz3aX31Qk6ieEYzfVsfqmT3dbTaTEABwUUgZVGWL', // configs since 2026-09-11
]
const FEE_CLAIMERS_SQL = JUP_STUDIO_FEE_CLAIMERS.map((a) => `'${a}'`).join(', ')

const LABELS = {
    TRADING_FEES_TO_CREATORS: 'Jup Studio Trading Fees To Creators',
    TRADING_FEES_TO_METEORA: 'Jup Studio Trading Fees To Meteora',
}

interface IData {
    quote_mint: string;
    trading_fees: number;
    protocol_fees: number;
    referral_fees: number;
    creator_fees: number;
    damm_v2_lp_fees: number;
}

// DBC swap event fees (state/config.rs split_fees): protocol = 20% of the fee, trading = the rest, referral = 20% of
// protocol, taken out of protocol. The trader pays trading + protocol + referral. trading is split between the creator
// (creator_trading_fee_percentage) and the partner (Jupiter). Fees charged in the base token
// (collect_fee_mode 1 on buys) are left out.
// DAMM v2 claims: for pools migrated from DBC, token B is the quote mint, so fee_b_claimed is the quote-side fee.
const fetch = async (options: FetchOptions) => {
    const query = `
        WITH
            cfg AS (
                SELECT
                    account_config,
                    account_quote_mint,
                    CAST(JSON_EXTRACT_SCALAR(config_parameters, '$.ConfigParameters.collect_fee_mode') AS INT) AS collect_fee_mode,
                    COALESCE(CAST(JSON_EXTRACT_SCALAR(config_parameters, '$.ConfigParameters.creator_trading_fee_percentage') AS INT), 0) AS creator_fee_pct
                FROM meteora_solana.dynamic_bonding_curve_call_create_config
                WHERE call_executing_account = 'dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN'
                    AND account_fee_claimer IN (${FEE_CLAIMERS_SQL})
            ),
            dbc AS (
                SELECT
                    c.account_quote_mint AS quote_mint,
                    c.creator_fee_pct,
                    CAST(JSON_EXTRACT_SCALAR(s.swap_result, '$.SwapResult.trading_fee') AS DECIMAL(38,0)) AS trading_fee,
                    CAST(JSON_EXTRACT_SCALAR(s.swap_result, '$.SwapResult.protocol_fee') AS DECIMAL(38,0)) AS protocol_fee,
                    CAST(JSON_EXTRACT_SCALAR(s.swap_result, '$.SwapResult.referral_fee') AS DECIMAL(38,0)) AS referral_fee
                FROM meteora_solana.dynamic_bonding_curve_evt_evtswap s
                JOIN cfg c ON c.account_config = s.config
                WHERE s.evt_executing_account = 'dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN'
                    AND s.evt_block_time >= from_unixtime(${options.startTimestamp})
                    AND s.evt_block_time < from_unixtime(${options.endTimestamp})
                    AND NOT (c.collect_fee_mode = 1 AND s.trade_direction = 1)
            ),
            pools AS (
                SELECT DISTINCT m.account_pool AS pool, m.account_quote_mint AS quote_mint
                FROM meteora_solana.dynamic_bonding_curve_call_migration_damm_v2 m
                JOIN cfg c ON c.account_config = m.account_config
            ),
            damm AS (
                SELECT p.quote_mint, SUM(CAST(e.fee_b_claimed AS DECIMAL(38,0))) AS lp_fees
                FROM meteora_solana.cp_amm_evt_evtclaimpositionfee e
                JOIN pools p ON p.pool = e.pool
                WHERE e.evt_executing_account = 'cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG'
                    AND e.owner IN (${FEE_CLAIMERS_SQL})
                    AND e.evt_block_time >= from_unixtime(${options.startTimestamp})
                    AND e.evt_block_time < from_unixtime(${options.endTimestamp})
                GROUP BY 1
            )
        SELECT
            quote_mint,
            SUM(trading_fee) AS trading_fees,
            SUM(protocol_fee) AS protocol_fees,
            SUM(referral_fee) AS referral_fees,
            SUM(trading_fee * creator_fee_pct / 100) AS creator_fees,
            CAST(0 AS DECIMAL(38,0)) AS damm_v2_lp_fees
        FROM dbc
        GROUP BY 1
        UNION ALL
        SELECT quote_mint, 0, 0, 0, 0, lp_fees FROM damm
    `
    const data: IData[] = await queryDuneSql(options, query)
    // Studio pools trade every day: an empty result is missing Dune data, not a zero day
    if (!data.length) throw new Error(`No Jup Studio swaps or fee claims found on Dune for ${options.dateString}`)

    const dailyFees = options.createBalances();
    const dailySupplySideRevenue = options.createBalances();
    const dailyRevenue = options.createBalances();

    const accepted_quote_mints = [
        ADDRESSES.solana.SOL,
        ADDRESSES.solana.USDC,
        ADDRESSES.solana.JUP
    ]
    data.forEach(row => {
        if (!accepted_quote_mints.includes(row.quote_mint)) return;
        const trading = Number(row.trading_fees);
        const protocol = Number(row.protocol_fees);
        const referral = Number(row.referral_fees);
        const creator = Number(row.creator_fees);
        const lp = Number(row.damm_v2_lp_fees);

        dailyFees.add(row.quote_mint, trading + protocol + referral + lp, JUPITER_METRICS.JupStudioFees);
        dailySupplySideRevenue.add(row.quote_mint, referral, JUPITER_METRICS.JupStudioFeesToReferrals);
        dailySupplySideRevenue.add(row.quote_mint, creator, LABELS.TRADING_FEES_TO_CREATORS);
        dailySupplySideRevenue.add(row.quote_mint, protocol, LABELS.TRADING_FEES_TO_METEORA);
        dailyRevenue.add(row.quote_mint, trading - creator + lp, JUPITER_METRICS.JupStudioFeesToJupiter);
    });

    return {
        dailyFees,
        dailyUserFees: dailyFees,
        dailyRevenue,
        dailyProtocolRevenue: dailyRevenue,
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
    doublecounted: true, // Studio pools are Meteora DBC curves and DAMM v2 pools, also counted on Meteora's listings
    methodology: {
        Fees: "Trading fees paid by users on Jup Studio bonding curves, and the fees Jupiter's LP position earns in graduated Meteora DAMM v2 pools, counted when claimed.",
        Revenue: "Jup Studio's share of bonding-curve trading fees (after the token creator's share) and its fees from migrated DAMM v2 pools.",
        SupplySideRevenue: "Fees paid to referrals, to token creators (their configured share of the trading fee) and to Meteora (its protocol fee).",
        ProtocolRevenue: "All of Jup Studio's revenue, kept by Jupiter. Not used for JUP buybacks.",
    },
    breakdownMethodology: {
        Fees: {
            [JUPITER_METRICS.JupStudioFees]: "Bonding-curve trading fees (creator, Jupiter, Meteora and referral shares) plus the DAMM v2 LP fees Jupiter claims.",
        },
        Revenue: {
            [JUPITER_METRICS.JupStudioFeesToJupiter]: "Jup Studio's share of trading fees, after the creator share, plus DAMM v2 position fees it claims.",
        },
        ProtocolRevenue: {
            [JUPITER_METRICS.JupStudioFeesToJupiter]: "All of Jup Studio's revenue, kept by Jupiter.",
        },
        SupplySideRevenue: {
            [JUPITER_METRICS.JupStudioFeesToReferrals]: 'Fees collected by referrals.',
            [LABELS.TRADING_FEES_TO_CREATORS]: "The token creator's configured share of the bonding-curve trading fee.",
            [LABELS.TRADING_FEES_TO_METEORA]: "Meteora's protocol fee on bonding-curve swaps.",
        },
    }
}

export default adapter
