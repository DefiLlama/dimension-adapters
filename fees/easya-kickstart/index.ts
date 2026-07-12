import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";
import ADDRESSES from '../../helpers/coreAssets.json';
import { METRIC } from "../../helpers/metrics";

// EasyA Kickstart is a Solana memecoin launchpad built on top of Meteora's
// Dynamic Bonding Curve (DBC) program. Every token launched via Kickstart is
// a DBC VirtualPool whose `config` field points at a PoolConfig created by one
// of EasyA's deployer wallets. All configs use WSOL as the quote asset.
//
// Partner configs and fee splits are read from DBC create_config calls signed by
// EasyA's deployer wallets (see EASYA_SIGNERS), excluding pre-launch activity
// before the product launch date.
const DBC_PROGRAM = 'dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN';
const LAUNCH_DATE = '2026-03-08';
const EASYA_SIGNERS = ['1kRMrKuuZhFW26Jt2woYreCKFu54atpaNuQ1wP3CXry', 'H6okppWszLPjpPqD6fZcoMG9uUk15NxDVjrAPjiewaD1'];

interface IData {
    total_trading_fees: string;
    total_creator_trading_fees: string;
    total_protocol_fees: string;
    total_referral_fees: string;
    total_damm_v2_fees: string;
    total_damm_v2_protocol_fees: string;
    total_damm_v2_creator_fees: string;
    total_damm_v2_referral_fees: string;
}

const fetch = async (options: FetchOptions) => {
    const tenHoursAgo = Date.now() - (10 * 60 * 60 * 1000);
    if ((options.toTimestamp * 1000) > tenHoursAgo) {
      throw new Error("End timestamp is less than 10 hours ago, skipping due to dune indexing delay");
    }
    const signers = EASYA_SIGNERS.map(s => `'${s}'`).join(', ');

    const data: IData[] = await queryDuneSql(options, `
    WITH
      easya_partner_configs AS (
        SELECT DISTINCT
          account_config AS config,
          CAST(JSON_EXTRACT_SCALAR(config_parameters, '$.ConfigParameters.collect_fee_mode') AS INT) AS collect_fee_mode,
          CAST(JSON_EXTRACT_SCALAR(config_parameters, '$.ConfigParameters.creator_trading_fee_percentage') AS INT) AS creator_trading_pct,
          CAST(JSON_EXTRACT_SCALAR(config_parameters, '$.ConfigParameters.creator_permanent_locked_liquidity_percentage') AS INT) AS creator_lp_pct
        FROM meteora_solana.dynamic_bonding_curve_call_create_config
        WHERE call_tx_signer IN (${signers})
          AND call_block_date >= TIMESTAMP '${LAUNCH_DATE} 00:00:00'
      ),
      migrated_pools AS (
        SELECT
          m.account_config,
          m.account_pool,
          MIN(m.call_block_time) AS migrated_at
        FROM meteora_solana.dynamic_bonding_curve_call_migration_damm_v2 m
        JOIN easya_partner_configs epc ON m.account_config = epc.config
        GROUP BY 1, 2
      ),
      swap_events AS (
        SELECT
          s.trade_direction,
          s.amount_in,
          c.collect_fee_mode,
          c.creator_trading_pct,
          CAST(JSON_EXTRACT_SCALAR(s.swap_result, '$.SwapResult.output_amount') AS DECIMAL(38,0)) AS amount_out,
          CAST(JSON_EXTRACT_SCALAR(s.swap_result, '$.SwapResult.trading_fee')  AS DECIMAL(38,0)) AS trading_fee,
          CAST(JSON_EXTRACT_SCALAR(s.swap_result, '$.SwapResult.protocol_fee') AS DECIMAL(38,0)) AS protocol_fee,
          CAST(JSON_EXTRACT_SCALAR(s.swap_result, '$.SwapResult.referral_fee') AS DECIMAL(38,0)) AS referral_fee
        FROM meteora_solana.dynamic_bonding_curve_evt_evtswap s
        JOIN easya_partner_configs c ON s.config = c.config
        WHERE s.evt_executing_account = '${DBC_PROGRAM}'
          AND s.evt_block_time >= from_unixtime(${options.startTimestamp})
          AND s.evt_block_time <  from_unixtime(${options.endTimestamp})
      ),
      damm_v2_swap_events AS (
        SELECT
          m.account_config,
          CAST(JSON_EXTRACT_SCALAR(s.swap_result, '$.SwapResult.lp_fee') AS DECIMAL(38,0)) AS lp_fee,
          CAST(JSON_EXTRACT_SCALAR(s.swap_result, '$.SwapResult.protocol_fee') AS DECIMAL(38,0)) AS protocol_fee,
          CAST(JSON_EXTRACT_SCALAR(s.swap_result, '$.SwapResult.referral_fee') AS DECIMAL(38,0)) AS referral_fee
        FROM meteora_solana.cp_amm_evt_evtswap s
        JOIN migrated_pools m ON s.pool = m.account_pool
        WHERE s.evt_block_time >= from_unixtime(${options.startTimestamp})
          AND s.evt_block_time <  from_unixtime(${options.endTimestamp})
          AND s.evt_block_time >= m.migrated_at

        UNION ALL

        SELECT
          m.account_config,
          CAST(JSON_EXTRACT_SCALAR(s.swap_result, '$.SwapResult2.trading_fee') AS DECIMAL(38,0)) AS lp_fee,
          CAST(JSON_EXTRACT_SCALAR(s.swap_result, '$.SwapResult2.protocol_fee') AS DECIMAL(38,0)) AS protocol_fee,
          CAST(JSON_EXTRACT_SCALAR(s.swap_result, '$.SwapResult2.referral_fee') AS DECIMAL(38,0)) AS referral_fee
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
          SUM(COALESCE(s.lp_fee, 0) * CAST(fs.creator_lp_pct AS DOUBLE) / 100) AS total_damm_v2_creator_fees,
          SUM(COALESCE(s.referral_fee, 0)) AS total_damm_v2_referral_fees
        FROM damm_v2_swap_events s
        LEFT JOIN easya_partner_configs fs ON s.account_config = fs.config
      )
    SELECT
      SUM(CASE WHEN collect_fee_mode = 1 AND trade_direction = 1 THEN 0 ELSE COALESCE(trading_fee,  0) END) AS total_trading_fees,
      SUM(CASE WHEN collect_fee_mode = 1 AND trade_direction = 1 THEN 0 ELSE COALESCE(trading_fee,  0) * CAST(creator_trading_pct AS DOUBLE) / 100 END) AS total_creator_trading_fees,
      SUM(CASE WHEN collect_fee_mode = 1 AND trade_direction = 1 THEN 0 ELSE COALESCE(protocol_fee, 0) END) AS total_protocol_fees,
      SUM(CASE WHEN collect_fee_mode = 1 AND trade_direction = 1 THEN 0 ELSE COALESCE(referral_fee, 0) END) AS total_referral_fees,
      (SELECT total_damm_v2_fees FROM damm_v2_totals) AS total_damm_v2_fees,
      (SELECT total_damm_v2_protocol_fees FROM damm_v2_totals) AS total_damm_v2_protocol_fees,
      (SELECT total_damm_v2_creator_fees FROM damm_v2_totals) AS total_damm_v2_creator_fees,
      (SELECT total_damm_v2_referral_fees FROM damm_v2_totals) AS total_damm_v2_referral_fees
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
        const dammV2ReferralFees = Number(row.total_damm_v2_referral_fees || 0);
        const kickstartTrading = trading - creatorTrading;
        const dammV2Revenue = dammV2Fees - dammV2CreatorFees;

        dailyFees.add(wsol, trading, METRIC.TRADING_FEES);
        dailyFees.add(wsol, dammV2Fees, "DAMM v2 LP Fees");
        dailyFees.add(wsol, protocol, "Protocol Fees to Meteora");
        dailyFees.add(wsol, dammV2ProtocolFees, "Protocol Fees to Meteora");
        dailyFees.add(wsol, referral, "Referral Fees");
        dailyFees.add(wsol, dammV2ReferralFees, "Referral Fees");
        dailyProtocolRevenue.add(wsol, kickstartTrading, "Trading Fees to Kickstart");
        dailyProtocolRevenue.add(wsol, dammV2Revenue, "DAMM v2 Fees to Kickstart");

        dailySupplySideRevenue.add(wsol, creatorTrading, "Trading Fees to Creators");
        dailySupplySideRevenue.add(wsol, dammV2CreatorFees, "DAMM v2 Fees to Creators");
        dailySupplySideRevenue.add(wsol, protocol, "Protocol Fees to Meteora");
        dailySupplySideRevenue.add(wsol, dammV2ProtocolFees, "Protocol Fees to Meteora");
        dailySupplySideRevenue.add(wsol, referral, "Referral Fees");
        dailySupplySideRevenue.add(wsol, dammV2ReferralFees, "Referral Fees");
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
        "Kickstart's share of DBC bonding-curve trading fees plus Kickstart's share of post-migration DAMM v2 LP fees, per on-chain pool config fee splits. The protocol_fee portion is collected by Meteora and is excluded.",
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
        "Referral Fees": "DBC and DAMM v2 referral fees paid to routing frontends out of the Meteora protocol share",
    },
    Revenue: {
        "Trading Fees to Kickstart": "Kickstart's share of DBC trading fees per on-chain pool config",
        "DAMM v2 Fees to Kickstart": "Kickstart's locked-LP share of post-migration DAMM v2 fees",
    },
    ProtocolRevenue: {
        "Trading Fees to Kickstart": "Kickstart's share of DBC trading fees per on-chain pool config",
        "DAMM v2 Fees to Kickstart": "Kickstart's locked-LP share of post-migration DAMM v2 fees",
    },
    SupplySideRevenue: {
        "Trading Fees to Creators": "DBC bonding-curve trading fees allocated to token creators per on-chain pool config",
        "DAMM v2 Fees to Creators": "Post-migration DAMM v2 LP fees allocated to token creators via their locked LP",
        "Protocol Fees to Meteora": "DBC and DAMM v2 Protocol Fees going to Meteora",
        "Referral Fees": "DBC and DAMM v2 referral fees paid to routing frontends out of the Meteora protocol share",
    },
};

const adapter: SimpleAdapter = {
    version: 1,
    fetch,
    chains: [CHAIN.SOLANA],
    dependencies: [Dependencies.DUNE],
    start: LAUNCH_DATE,
    isExpensiveAdapter: true,
    doublecounted: true, //meteora-dbc
    methodology,
    breakdownMethodology,
};

export default adapter;
