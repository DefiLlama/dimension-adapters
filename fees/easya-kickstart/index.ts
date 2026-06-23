import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";
import ADDRESSES from '../../helpers/coreAssets.json';
import { METRIC } from "../../helpers/metrics";

// EasyA Kickstart is a Solana memecoin launchpad built on top of Meteora's
// Dynamic Bonding Curve (DBC) program. Every token launched via Kickstart is
// a DBC VirtualPool whose `config` field points at one of EasyA's four
// PoolConfig accounts (all share the same fee_claimer EfgbywXHbDn...).
// All four configs use WSOL as the quote asset.
const DBC_PROGRAM = 'dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN';
const EASYA_PARTNER_CONFIGS = [
    'FctVFHQvVaj3hTDHCSXZjTmmsRs5bX5ogUPGHFSgrJpU',
    'NHT6MNushFNWpaFgQs5k49HHzsas9jQAVoRvqyXc5Qx',
    '6iEekXhre85eDB1mxRuXbRDHbSG8HeSPYopp9e7fp4BJ',
    '5WP4ZKstxzM6vUxE4xCahuXowaJeEXgLUhCXCKm7yqRy',
    'CeEB3UDmhoWfcVFXY1RShQnhhiL3rYMm93M61S228bzy',
    'DD3y1mi4yeQSLNbNGZTxUwdwbEm4Gh2injjx1N9HPCqQ',
];

interface IData {
    total_trading_fees: string;
    total_protocol_fees: string;
    total_referral_fees: string;
    total_damm_v2_fees: string;
    total_damm_v2_protocol_fees: string;
    total_damm_v2_revenue: string;
}

const fetch = async (options: FetchOptions) => {
    const configs = EASYA_PARTNER_CONFIGS.map(c => `'${c}'`).join(',');

    const data: IData[] = await queryDuneSql(options, `
    WITH
      dbc_configs AS (
        SELECT
          account_config,
          CAST(JSON_EXTRACT_SCALAR(config_parameters, '$.ConfigParameters.collect_fee_mode') AS INT) AS collect_fee_mode
        FROM meteora_solana.dynamic_bonding_curve_call_create_config
        WHERE account_config IN (${configs})
      ),
      config_fees AS (
        SELECT
          config,
          COALESCE(
            TRY_CAST(JSON_EXTRACT_SCALAR(config_parameters, '$.creator_liquidity_percentage') AS DOUBLE),
            50
          ) AS creator_liquidity_pct,
          COALESCE(
            TRY_CAST(JSON_EXTRACT_SCALAR(config_parameters, '$.creator_permanent_locked_liquidity_percentage') AS DOUBLE),
            0
          ) AS creator_permanent_locked_liquidity_pct
        FROM meteora_solana.dynamic_bonding_curve_evt_evtcreateconfigv2
        WHERE config IN (${configs})
      ),
      migrated_pools AS (
        SELECT
          account_config,
          account_pool,
          MIN(call_block_time) AS migrated_at
        FROM meteora_solana.dynamic_bonding_curve_call_migration_damm_v2
        WHERE account_config IN (${configs})
        GROUP BY 1, 2
      ),
      swap_events AS (
        SELECT
          s.trade_direction,
          s.amount_in,
          c.collect_fee_mode,
          CAST(JSON_EXTRACT_SCALAR(s.swap_result, '$.SwapResult.output_amount') AS DECIMAL(38,0)) AS amount_out,
          CAST(JSON_EXTRACT_SCALAR(s.swap_result, '$.SwapResult.trading_fee')  AS DECIMAL(38,0)) AS trading_fee,
          CAST(JSON_EXTRACT_SCALAR(s.swap_result, '$.SwapResult.protocol_fee') AS DECIMAL(38,0)) AS protocol_fee,
          CAST(JSON_EXTRACT_SCALAR(s.swap_result, '$.SwapResult.referral_fee') AS DECIMAL(38,0)) AS referral_fee
        FROM meteora_solana.dynamic_bonding_curve_evt_evtswap s
        JOIN dbc_configs c ON s.config = c.account_config
        WHERE s.evt_executing_account = '${DBC_PROGRAM}'
          AND s.evt_block_time >= from_unixtime(${options.startTimestamp})
          AND s.evt_block_time <  from_unixtime(${options.endTimestamp})
      ),
      damm_v2_swap_events AS (
        SELECT
          m.account_config,
          CAST(JSON_EXTRACT_SCALAR(s.swap_result, '$.SwapResult.lp_fee') AS DECIMAL(38,0)) AS lp_fee,
          CAST(JSON_EXTRACT_SCALAR(s.swap_result, '$.SwapResult.protocol_fee') AS DECIMAL(38,0)) AS protocol_fee
        FROM meteora_solana.cp_amm_evt_evtswap s
        JOIN migrated_pools m ON s.pool = m.account_pool
        WHERE s.evt_block_time >= from_unixtime(${options.startTimestamp})
          AND s.evt_block_time <  from_unixtime(${options.endTimestamp})
          AND s.evt_block_time >= m.migrated_at

        UNION ALL

        SELECT
          m.account_config,
          CAST(JSON_EXTRACT_SCALAR(s.swap_result, '$.SwapResult2.trading_fee') AS DECIMAL(38,0)) AS lp_fee,
          CAST(JSON_EXTRACT_SCALAR(s.swap_result, '$.SwapResult2.protocol_fee') AS DECIMAL(38,0)) AS protocol_fee
        FROM meteora_solana.cp_amm_evt_evtswap2 s
        JOIN migrated_pools m ON s.pool = m.account_pool
        WHERE s.evt_block_time >= from_unixtime(${options.startTimestamp})
          AND s.evt_block_time <  from_unixtime(${options.endTimestamp})
          AND s.evt_block_time >= m.migrated_at
      ),
      damm_v2_revenue AS (
        SELECT
          SUM(COALESCE(s.lp_fee, 0)) AS total_damm_v2_fees,
          SUM(COALESCE(s.protocol_fee, 0)) AS total_damm_v2_protocol_fees,
          SUM(
            COALESCE(s.lp_fee, 0)
            * (100 - COALESCE(c.creator_liquidity_pct, 50) - COALESCE(c.creator_permanent_locked_liquidity_pct, 0))
            / 100
          ) AS total_damm_v2_revenue
        FROM damm_v2_swap_events s
        LEFT JOIN config_fees c ON s.account_config = c.config
      )
    SELECT
      SUM(CASE WHEN collect_fee_mode = 1 AND trade_direction = 1 THEN 0 ELSE COALESCE(trading_fee,  0) END) AS total_trading_fees,
      SUM(CASE WHEN collect_fee_mode = 1 AND trade_direction = 1 THEN 0 ELSE COALESCE(protocol_fee, 0) END) AS total_protocol_fees,
      SUM(CASE WHEN collect_fee_mode = 1 AND trade_direction = 1 THEN 0 ELSE COALESCE(referral_fee, 0) END) AS total_referral_fees,
      (SELECT total_damm_v2_fees FROM damm_v2_revenue) AS total_damm_v2_fees,
      (SELECT total_damm_v2_protocol_fees FROM damm_v2_revenue) AS total_damm_v2_protocol_fees,
      (SELECT total_damm_v2_revenue FROM damm_v2_revenue) AS total_damm_v2_revenue
    FROM swap_events
  `);

    const wsol = ADDRESSES.solana.SOL;
    const dailyFees = options.createBalances();
    const dailyProtocolRevenue = options.createBalances();
    const dailySupplySideRevenue = options.createBalances();

    const row = data?.[0];
    if (row) {
        const trading = Number(row.total_trading_fees || 0);
        const protocol = Number(row.total_protocol_fees || 0);
        const referral = Number(row.total_referral_fees || 0);
        const dammV2Fees = Number(row.total_damm_v2_fees || 0);
        const dammV2ProtocolFees = Number(row.total_damm_v2_protocol_fees || 0);
        const dammV2Revenue = Number(row.total_damm_v2_revenue || 0);
        const dammV2CreatorFees = dammV2Fees - dammV2Revenue;

        dailyFees.add(wsol, trading, METRIC.TRADING_FEES);
        dailyFees.add(wsol, dammV2Fees, "DAMM v2 LP Fees");
        dailyFees.add(wsol, protocol, "Protocol Fees to Meteora");
        dailyFees.add(wsol, dammV2ProtocolFees, "Protocol Fees to Meteora");
        dailyFees.add(wsol, referral, "Referral Fees");
        dailyProtocolRevenue.add(wsol, trading, "Trading Fees to Kickstart");
        dailyProtocolRevenue.add(wsol, dammV2Revenue, "DAMM v2 Fees to Kickstart");

        dailySupplySideRevenue.add(wsol, dammV2CreatorFees, "DAMM v2 Fees to Creators");
        dailySupplySideRevenue.add(wsol, protocol, "Protocol Fees to Meteora");
        dailySupplySideRevenue.add(wsol, dammV2ProtocolFees, "Protocol Fees to Meteora");
        dailySupplySideRevenue.add(wsol, referral, "Referral Fees");
    }

    return {
        dailyFees,
        dailyUserFees: dailyFees,
        dailyRevenue: dailyProtocolRevenue,
        dailyProtocolRevenue,
        dailySupplySideRevenue,
    };
};

const methodology = {
    Fees:
        'Total swap fees paid by users on Kickstart bonding curves plus post-migration DAMM v2 LP and protocol fees generated by Kickstart-launched pools. DBC swap fees include trading_fee + protocol_fee + referral_fee from Meteora DBC swap events.',
    Revenue:
        "Trading fees retained by the Kickstart protocol from DBC pools and Kickstart's LP share of post-migration DAMM v2 fees. The protocol_fee portion is collected by Meteora and is excluded.",
    ProtocolRevenue:
        'Same as Revenue: Trading fees retained by the Kickstart protocol, excluding the cut that goes to Meteora.',
    SupplySideRevenue:
        'Includes DAMM v2 LP fees allocated to token creators, Protocol fees going to Meteora, and Referral fees going to referrers',
};

const breakdownMethodology = {
    Fees: {
        [METRIC.TRADING_FEES]: "DBC Trading Fees going to Kickstart",
        "DAMM v2 LP Fees": "Post-migration DAMM v2 LP fees generated by Kickstart-launched pools",
        "Protocol Fees to Meteora": "DBC and DAMM v2 Protocol Fees going to Meteora",
        "Referral Fees": "DBC Referral Fees going to referrers",
    },
    Revenue: {
        "Trading Fees to Kickstart": "DBC Trading Fees going to Kickstart",
        "DAMM v2 Fees to Kickstart": "Kickstart LP share of post-migration DAMM v2 fees",
    },
    ProtocolRevenue: {
        "Trading Fees to Kickstart": "DBC Trading Fees going to Kickstart",
        "DAMM v2 Fees to Kickstart": "Kickstart LP share of post-migration DAMM v2 fees",
    },
    SupplySideRevenue: {
        "DAMM v2 Fees to Creators": "Post-migration DAMM v2 LP fees allocated to token creators",
        "Protocol Fees to Meteora": "DBC and DAMM v2 Protocol Fees going to Meteora",
        "Referral Fees": "DBC Referral Fees going to referrers",
    },
};

const adapter: SimpleAdapter = {
    version: 1,
    fetch,
    chains: [CHAIN.SOLANA],
    dependencies: [Dependencies.DUNE],
    start: "2026-03-08",
    isExpensiveAdapter: true,
    doublecounted: true, //meteora-dbc
    methodology,
    breakdownMethodology,
};

export default adapter;
