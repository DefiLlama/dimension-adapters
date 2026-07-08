import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";
import ADDRESSES from '../../helpers/coreAssets.json';
import { METRIC } from "../../helpers/metrics";

// EasyA Kickstart is a Solana memecoin launchpad built on top of Meteora's
// Dynamic Bonding Curve (DBC) program. Every token launched via Kickstart is
// a DBC VirtualPool whose `config` field points at one of EasyA's eight
// production PoolConfig accounts (all share the same fee_claimer
// 1kRMrKuuZhFW26Jt2woYreCKFu54atpaNuQ1wP3CXry). All configs use WSOL as the
// quote asset.
//
// Deliberately excluded (per the EasyA team): three pre-launch dev/testing
// configs (Ad8F8KfT..., 2rDu7vM4..., APoF1UjW..., ~0.64 SOL lifetime fees
// combined - not product usage), and one config created by an unrelated
// third-party deployer that merely names EasyA's wallet as fee_claimer
// (2SX1yP1p..., routes 100% of fees to the token creator).
//
// Fee splits are immutable PoolConfig constants, hardcoded here because the
// on-chain values are what the programs enforce:
// - creator_trading_pct: share of DBC bonding-curve trading fees that belongs
//   to the token creator (claim_creator_trading_fee). 50% on every config
//   except NHT6..., an early config that routes 100% to Kickstart.
// - creator_lp_pct: creator's share of the permanently-locked LP created at
//   DAMM v2 migration, which determines the creator's share of post-migration
//   LP fees. 50% everywhere except NHT6... (0%; Kickstart holds 100% of the
//   locked LP for those pools).
const DBC_PROGRAM = 'dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN';
const EASYA_PARTNER_CONFIGS: { config: string; creatorTradingPct: number; creatorLpPct: number }[] = [
    { config: 'FctVFHQvVaj3hTDHCSXZjTmmsRs5bX5ogUPGHFSgrJpU', creatorTradingPct: 50, creatorLpPct: 50 },
    { config: 'NHT6MNushFNWpaFgQs5k49HHzsas9jQAVoRvqyXc5Qx', creatorTradingPct: 0, creatorLpPct: 0 },
    { config: '6iEekXhre85eDB1mxRuXbRDHbSG8HeSPYopp9e7fp4BJ', creatorTradingPct: 50, creatorLpPct: 50 },
    { config: '5WP4ZKstxzM6vUxE4xCahuXowaJeEXgLUhCXCKm7yqRy', creatorTradingPct: 50, creatorLpPct: 50 },
    { config: 'CeEB3UDmhoWfcVFXY1RShQnhhiL3rYMm93M61S228bzy', creatorTradingPct: 50, creatorLpPct: 50 },
    { config: 'DD3y1mi4yeQSLNbNGZTxUwdwbEm4Gh2injjx1N9HPCqQ', creatorTradingPct: 50, creatorLpPct: 50 },
    { config: 'eL5edjSJ7eLzoZBfhQFPCDc869ohRivDtjZHtBYSKJj', creatorTradingPct: 50, creatorLpPct: 50 },
    { config: 'BDGzj4UicpZFwTNdGWC6ZeuBu8eDCd5jSRXXC7J5L6Q2', creatorTradingPct: 50, creatorLpPct: 50 },
];

interface IData {
    total_trading_fees: string;
    total_creator_trading_fees: string;
    total_protocol_fees: string;
    total_referral_fees: string;
    total_damm_v2_fees: string;
    total_damm_v2_protocol_fees: string;
    total_damm_v2_creator_fees: string;
}

const fetch = async (options: FetchOptions) => {
    const configs = EASYA_PARTNER_CONFIGS.map(c => `'${c.config}'`).join(',');
    const configShareRows = EASYA_PARTNER_CONFIGS
        .map(c => `('${c.config}', ${c.creatorTradingPct}, ${c.creatorLpPct})`)
        .join(',\n          ');

    const data: IData[] = await queryDuneSql(options, `
    WITH
      config_shares AS (
        SELECT * FROM (VALUES
          ${configShareRows}
        ) AS t(config, creator_trading_pct, creator_lp_pct)
      ),
      dbc_configs AS (
        SELECT
          account_config,
          CAST(JSON_EXTRACT_SCALAR(config_parameters, '$.ConfigParameters.collect_fee_mode') AS INT) AS collect_fee_mode
        FROM meteora_solana.dynamic_bonding_curve_call_create_config
        WHERE account_config IN (${configs})
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
          fs.creator_trading_pct,
          CAST(JSON_EXTRACT_SCALAR(s.swap_result, '$.SwapResult.output_amount') AS DECIMAL(38,0)) AS amount_out,
          CAST(JSON_EXTRACT_SCALAR(s.swap_result, '$.SwapResult.trading_fee')  AS DECIMAL(38,0)) AS trading_fee,
          CAST(JSON_EXTRACT_SCALAR(s.swap_result, '$.SwapResult.protocol_fee') AS DECIMAL(38,0)) AS protocol_fee,
          CAST(JSON_EXTRACT_SCALAR(s.swap_result, '$.SwapResult.referral_fee') AS DECIMAL(38,0)) AS referral_fee
        FROM meteora_solana.dynamic_bonding_curve_evt_evtswap s
        JOIN dbc_configs c ON s.config = c.account_config
        JOIN config_shares fs ON s.config = fs.config
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
      damm_v2_totals AS (
        SELECT
          SUM(COALESCE(s.lp_fee, 0)) AS total_damm_v2_fees,
          SUM(COALESCE(s.protocol_fee, 0)) AS total_damm_v2_protocol_fees,
          SUM(COALESCE(s.lp_fee, 0) * CAST(COALESCE(fs.creator_lp_pct, 50) AS DOUBLE) / 100) AS total_damm_v2_creator_fees
        FROM damm_v2_swap_events s
        LEFT JOIN config_shares fs ON s.account_config = fs.config
      )
    SELECT
      SUM(CASE WHEN collect_fee_mode = 1 AND trade_direction = 1 THEN 0 ELSE COALESCE(trading_fee,  0) END) AS total_trading_fees,
      SUM(CASE WHEN collect_fee_mode = 1 AND trade_direction = 1 THEN 0 ELSE COALESCE(trading_fee,  0) * CAST(creator_trading_pct AS DOUBLE) / 100 END) AS total_creator_trading_fees,
      SUM(CASE WHEN collect_fee_mode = 1 AND trade_direction = 1 THEN 0 ELSE COALESCE(protocol_fee, 0) END) AS total_protocol_fees,
      SUM(CASE WHEN collect_fee_mode = 1 AND trade_direction = 1 THEN 0 ELSE COALESCE(referral_fee, 0) END) AS total_referral_fees,
      (SELECT total_damm_v2_fees FROM damm_v2_totals) AS total_damm_v2_fees,
      (SELECT total_damm_v2_protocol_fees FROM damm_v2_totals) AS total_damm_v2_protocol_fees,
      (SELECT total_damm_v2_creator_fees FROM damm_v2_totals) AS total_damm_v2_creator_fees
    FROM swap_events
  `);

    const wsol = ADDRESSES.solana.SOL;
    const dailyFees = options.createBalances();
    const dailyProtocolRevenue = options.createBalances();
    const dailySupplySideRevenue = options.createBalances();

    const row = data?.[0];
    if (row) {
        const trading = Number(row.total_trading_fees || 0);
        const creatorTrading = Number(row.total_creator_trading_fees || 0);
        const protocol = Number(row.total_protocol_fees || 0);
        const referral = Number(row.total_referral_fees || 0);
        const dammV2Fees = Number(row.total_damm_v2_fees || 0);
        const dammV2ProtocolFees = Number(row.total_damm_v2_protocol_fees || 0);
        const dammV2CreatorFees = Number(row.total_damm_v2_creator_fees || 0);
        const kickstartTrading = trading - creatorTrading;
        const dammV2Revenue = dammV2Fees - dammV2CreatorFees;

        dailyFees.add(wsol, trading, METRIC.TRADING_FEES);
        dailyFees.add(wsol, dammV2Fees, "DAMM v2 LP Fees");
        dailyFees.add(wsol, protocol, "Protocol Fees to Meteora");
        dailyFees.add(wsol, dammV2ProtocolFees, "Protocol Fees to Meteora");
        dailyFees.add(wsol, referral, "Referral Fees");
        dailyProtocolRevenue.add(wsol, kickstartTrading, "Trading Fees to Kickstart");
        dailyProtocolRevenue.add(wsol, dammV2Revenue, "DAMM v2 Fees to Kickstart");

        dailySupplySideRevenue.add(wsol, creatorTrading, "Trading Fees to Creators");
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
        "Kickstart's share of DBC bonding-curve trading fees (50% on current configs; token creators receive the other 50%) plus Kickstart's share of post-migration DAMM v2 LP fees. The protocol_fee portion is collected by Meteora and is excluded.",
    ProtocolRevenue:
        'Same as Revenue: trading fees retained by the Kickstart protocol, excluding the creator share and the cut that goes to Meteora.',
    SupplySideRevenue:
        'DBC bonding-curve trading fees allocated to token creators, DAMM v2 LP fees allocated to token creators, protocol fees going to Meteora, and referral fees going to referrers',
};

const breakdownMethodology = {
    Fees: {
        [METRIC.TRADING_FEES]: "DBC trading fees, split between Kickstart and token creators per the pool config",
        "DAMM v2 LP Fees": "Post-migration DAMM v2 LP fees generated by Kickstart-launched pools",
        "Protocol Fees to Meteora": "DBC and DAMM v2 Protocol Fees going to Meteora",
        "Referral Fees": "DBC Referral Fees going to referrers",
    },
    Revenue: {
        "Trading Fees to Kickstart": "Kickstart's share of DBC trading fees (50% on current configs, 100% on one early config)",
        "DAMM v2 Fees to Kickstart": "Kickstart's locked-LP share of post-migration DAMM v2 fees",
    },
    ProtocolRevenue: {
        "Trading Fees to Kickstart": "Kickstart's share of DBC trading fees (50% on current configs, 100% on one early config)",
        "DAMM v2 Fees to Kickstart": "Kickstart's locked-LP share of post-migration DAMM v2 fees",
    },
    SupplySideRevenue: {
        "Trading Fees to Creators": "DBC bonding-curve trading fees allocated to token creators (50% on all configs except one early config at 0%)",
        "DAMM v2 Fees to Creators": "Post-migration DAMM v2 LP fees allocated to token creators via their locked LP",
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
