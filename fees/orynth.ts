import { Dependencies, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryDuneSql } from "../helpers/dune";
import { FetchOptions } from "../adapters/types";
import { METRIC } from "../helpers/metrics";

const PLATFORM_WALLET = "7c8XjugvjW5pMKkrV5myZfoWrQ1QHjwWC3RYZWUToJRk";
const QUOTE_MINT_DEFAULT = "So11111111111111111111111111111111111111112";

const metrics = {
  TradingFees: METRIC.TRADING_FEES,
  PartnersFees: "Partners Fees",
  ProtocolFees: "Protocol Fees",
};

// Shared CTE for platform configs — used by both DBC and DAMM v2 queries
const CONFIGS_CTE = `
    platform_configs AS (
        SELECT DISTINCT account_config
        FROM meteora_solana.dynamic_bonding_curve_call_initialize_virtual_pool_with_spl_token
        WHERE account_creator = '{{platformWallet}}'
    )`;

// Combined query: DBC (non-migrated) + DAMM v2 (migrated) in a single Dune API call
const combinedSQL = `
    WITH
    ${CONFIGS_CTE},
    migrated_configs AS (
        SELECT DISTINCT account_config
        FROM meteora_solana.dynamic_bonding_curve_call_migration_damm_v2
    ),
    dbc_tokens AS (
        SELECT DISTINCT
            p.account_config,
            p.account_quote_mint
        FROM meteora_solana.dynamic_bonding_curve_call_initialize_virtual_pool_with_spl_token p
        JOIN platform_configs pc ON p.account_config = pc.account_config
        WHERE p.account_creator = '{{platformWallet}}'
          AND p.account_config NOT IN (SELECT account_config FROM migrated_configs)
    ),
    dbc_swap_events AS (
        SELECT
            s.config,
            t.account_quote_mint,
            s.trade_direction,
            s.amount_in,
            CAST(JSON_EXTRACT_SCALAR(s.swap_result, '$.SwapResult.trading_fee') AS DECIMAL(38,0)) AS trading_fee,
            CAST(JSON_EXTRACT_SCALAR(s.swap_result, '$.SwapResult.protocol_fee') AS DECIMAL(38,0)) AS protocol_fee,
            CAST(JSON_EXTRACT_SCALAR(s.swap_result, '$.SwapResult.output_amount') AS DECIMAL(38,0)) AS output_amount
        FROM meteora_solana.dynamic_bonding_curve_evt_evtswap s
        JOIN dbc_tokens t ON s.config = t.account_config
        WHERE s.evt_block_time >= from_unixtime({{start}})
          AND s.evt_block_time < from_unixtime({{end}})
    ),
    dbc_results AS (
        SELECT
            'dbc' AS source,
            account_quote_mint AS identifier,
            SUM(
                CASE
                    WHEN trade_direction = 1 THEN COALESCE(amount_in, 0)
                    ELSE COALESCE(output_amount, 0)
                END
            ) AS total_volume,
            SUM(COALESCE(trading_fee, 0)) AS fee_1,
            SUM(COALESCE(protocol_fee, 0)) AS fee_2,
            CAST(0 AS DECIMAL(38,0)) AS fee_3
        FROM dbc_swap_events
        GROUP BY account_quote_mint
    ),
    migration_configs AS (
      SELECT DISTINCT
        m.account_config,
        m.account_pool
      FROM meteora_solana.dynamic_bonding_curve_call_migration_damm_v2 m
      JOIN platform_configs pc ON m.account_config = pc.account_config
    ),
    damm_swap_events AS (
      SELECT
        s.pool,
        m.account_config,
        TRY(TRY_CAST(JSON_EXTRACT(s.swap_result, '$.SwapResult2.output_amount') AS BIGINT)) AS output_amount,
        TRY(TRY_CAST(JSON_EXTRACT(s.swap_result, '$.SwapResult2.trading_fee') AS BIGINT)) AS trading_fee,
        TRY(TRY_CAST(JSON_EXTRACT(s.swap_result, '$.SwapResult2.protocol_fee') AS BIGINT)) AS protocol_fee,
        TRY(TRY_CAST(JSON_EXTRACT(s.swap_result, '$.SwapResult2.partner_fee') AS BIGINT)) AS partner_fee
      FROM meteora_solana.cp_amm_evt_evtswap2 s
      JOIN migration_configs m ON s.pool = m.account_pool
      WHERE s.evt_block_time >= from_unixtime({{start}})
        AND s.evt_block_time < from_unixtime({{end}})
    ),
    damm_results AS (
      SELECT
          'dammv2' AS source,
          account_config AS identifier,
          SUM(COALESCE(output_amount, 0)) AS total_volume,
          SUM(COALESCE(trading_fee, 0)) AS fee_1,
          SUM(COALESCE(protocol_fee, 0)) AS fee_2,
          SUM(COALESCE(partner_fee, 0)) AS fee_3
      FROM damm_swap_events
      GROUP BY account_config
    )
    SELECT source, identifier, total_volume, fee_1, fee_2, fee_3 FROM dbc_results
    UNION ALL
    SELECT source, identifier, total_volume, fee_1, fee_2, fee_3 FROM damm_results
`;

const getSqlFromString = (sql: string, variables: Record<string, any> = {}): string => {
  Object.entries(variables).forEach(([key, value]) => {
    sql = sql.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), String(value));
  });
  return sql;
};

const fetch = async (options: FetchOptions) => {
  // Single Dune API call for both DBC and DAMM v2 data
  const query = getSqlFromString(combinedSQL, {
    platformWallet: PLATFORM_WALLET,
    start: options.startTimestamp,
    end: options.endTimestamp,
  });
  const data: { source: string; identifier: string; total_volume: number; fee_1: number; fee_2: number; fee_3: number }[] = await queryDuneSql(options, query);

  const dbcData = data.filter(r => r.source === 'dbc');
  const dammv2Data = data.filter(r => r.source === 'dammv2');

  // Step 2: Aggregate fees and volume
  const dailyFees = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();

  // DBC — fee_1 = trading_fee, fee_2 = protocol_fee
  dbcData.forEach((row) => {
    dailyFees.add(row.identifier, Number(row.fee_1), metrics.TradingFees);
    dailyFees.add(row.identifier, Number(row.fee_2), metrics.ProtocolFees);

    dailyProtocolRevenue.add(row.identifier, Number(row.fee_1), metrics.TradingFees);
    dailyProtocolRevenue.add(row.identifier, Number(row.fee_2), metrics.ProtocolFees);
  });

  // DAMM v2 — fee_1 = lp_fee (trading), fee_2 = protocol_fee, fee_3 = partner_fee
  dammv2Data.forEach((row) => {
    const quoteMint = dbcData[0]?.identifier ?? QUOTE_MINT_DEFAULT;
    dailyFees.add(quoteMint, Number(row.fee_1), metrics.TradingFees);
    dailyFees.add(quoteMint, Number(row.fee_3), metrics.PartnersFees);
    dailyFees.add(quoteMint, Number(row.fee_2), metrics.ProtocolFees);

    dailyProtocolRevenue.add(quoteMint, Number(row.fee_1), metrics.TradingFees);
    dailyProtocolRevenue.add(quoteMint, Number(row.fee_2), metrics.ProtocolFees);
  });

  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue: dailyProtocolRevenue,
    dailyProtocolRevenue,
  };
};

const adapter: SimpleAdapter = {
  fetch,
  chains: [CHAIN.SOLANA],
  start: "2025-11-21",
  dependencies: [Dependencies.DUNE],
  methodology: {
    Fees: "Total trading fees paid by users.",
    UserFees: "Total trading fees paid by users.",
    Revenue: "Fees collected by Orynth.",
    ProtocolRevenue: "All fees collected by Orynth.",
  },
  breakdownMethodology: {
    Fees: {
      [metrics.TradingFees]: "Total trading fees paid by users.",
      [metrics.PartnersFees]: "Amount of fees paid to partners.",
      [metrics.ProtocolFees]: "Amount of fees paid to Orynth protocol.",
    },
    Revenue: {
      [metrics.TradingFees]: "Total trading fees paid by users.",
      [metrics.ProtocolFees]: "Total fees paid to Orynth protocol.",
    },
    ProtocolRevenue: {
      [metrics.TradingFees]: "Total trading fees paid by users.",
      [metrics.ProtocolFees]: "Total fees paid to Orynth protocol.",
    },
  },
};

export default adapter;

