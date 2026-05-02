import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";
import ADDRESSES from '../../helpers/coreAssets.json';
import { METRIC } from "../../helpers/metrics";

// EasyA Kickstart is a Solana memecoin launchpad built on top of Meteora's
// Dynamic Bonding Curve (DBC) program. Every token launched via Kickstart is
// a DBC VirtualPool whose `config` field points at one of EasyA's three
// PoolConfig accounts (all share the same fee_claimer EfgbywXHbDn...).
// All three configs use WSOL as the quote asset.
const DBC_PROGRAM = 'dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN';
const EASYA_PARTNER_CONFIGS = [
    'FctVFHQvVaj3hTDHCSXZjTmmsRs5bX5ogUPGHFSgrJpU',
    'NHT6MNushFNWpaFgQs5k49HHzsas9jQAVoRvqyXc5Qx',
    '6iEekXhre85eDB1mxRuXbRDHbSG8HeSPYopp9e7fp4BJ',
];

interface IData {
    total_volume: string;
    total_trading_fees: string;
    total_protocol_fees: string;
    total_referral_fees: string;
}

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
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
      )
    SELECT
      SUM(CASE WHEN trade_direction = 1 THEN COALESCE(amount_in, 0) ELSE COALESCE(amount_out, 0) END) AS total_volume,
      SUM(CASE WHEN collect_fee_mode = 1 AND trade_direction = 1 THEN 0 ELSE COALESCE(trading_fee,  0) END) AS total_trading_fees,
      SUM(CASE WHEN collect_fee_mode = 1 AND trade_direction = 1 THEN 0 ELSE COALESCE(protocol_fee, 0) END) AS total_protocol_fees,
      SUM(CASE WHEN collect_fee_mode = 1 AND trade_direction = 1 THEN 0 ELSE COALESCE(referral_fee, 0) END) AS total_referral_fees
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

        dailyFees.add(wsol, trading, METRIC.TRADING_FEES);
        dailyFees.add(wsol, protocol, "Protocol Fees to Meteora");
        dailyFees.add(wsol, referral, "Referral Fees");
        // From EasyA's perspective Meteora is the underlying infrastructure;
        // the protocol_fee paid to Meteora is therefore the supply-side cost.
        // The remaining trading_fee + referral_fee is what the EasyA launchpad
        // ecosystem (partner wallet, creators, referrers) retains as revenue.
        // This satisfies the income-statement identity:
        //   dailyFees - dailySupplySideRevenue == dailyRevenue.
        dailyProtocolRevenue.add(wsol, trading, "Trading Fees to EasyA");

        dailySupplySideRevenue.add(wsol, protocol, "Protocol Fees to Meteora");
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
        'Total swap fees paid by users on EasyA Kickstart bonding curves: trading_fee + protocol_fee + referral_fee from Meteora DBC swap events.',
    Revenue:
        'Fees retained by the EasyA Kickstart ecosystem (trading_fee + referral_fee). The protocol_fee portion is collected by Meteora and is excluded.',
    ProtocolRevenue:
        'Same as Revenue: fees retained by EasyA (trading_fee + referral_fee), excluding the cut that goes to Meteora.',
    SupplySideRevenue:
        'Infrastructure fee retained by Meteora (protocol_fee), the underlying DBC program that powers EasyA Kickstart bonding curves.',
};

const breakdownMethodology = {
    Fees: {
        [METRIC.TRADING_FEES]: "DBC Trading Fees going to EasyA",
        "Protocol Fees to Meteora": "DBC Protocol Fees going to Meteora",
        "Referral Fees": "DBC Referral Fees going to referrers",
    },
    Revenue: {
        [METRIC.TRADING_FEES]: "DBC Trading Fees going to EasyA",
    },
    ProtocolRevenue: {
        [METRIC.TRADING_FEES]: "DBC Trading Fees going to EasyA",
    },
    SupplySideRevenue: {
        "Protocol Fees to Meteora": "DBC Protocol Fees going to Meteora",
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
