import { Dependencies, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryDuneSql } from "../helpers/dune";
import { FetchOptions } from "../adapters/types";
import { METRIC } from "../helpers/metrics";

const metrics = {
  TradingFees: METRIC.TRADING_FEES,
  PartnerFees: 'Partner Fees',
  ReferralFees: 'Referral Fees',
  ProtocolFees: 'Protocol Fees',
}

// Combined query: DBC + DAMM v2 in a single Dune API call
const combinedSQL = `
  WITH
      dbc_tokens AS (
          SELECT DISTINCT
              account_config,
              account_quote_mint
          FROM meteora_solana.dynamic_bonding_curve_call_initialize_virtual_pool_with_token2022
          WHERE account_config IN ('{{config}}')
      ),
      dbc_swap_events AS (
          SELECT
              s.config,
              t.account_quote_mint,
              CAST(JSON_EXTRACT_SCALAR(s.swap_result, '$.SwapResult.trading_fee') AS DECIMAL(38,0)) AS trading_fee,
              CAST(JSON_EXTRACT_SCALAR(s.swap_result, '$.SwapResult.protocol_fee') AS DECIMAL(38,0)) AS protocol_fee,
              CAST(JSON_EXTRACT_SCALAR(s.swap_result, '$.SwapResult.referral_fee') AS DECIMAL(38,0)) AS referral_fee
          FROM meteora_solana.dynamic_bonding_curve_evt_evtswap s
          JOIN dbc_tokens t ON s.config = t.account_config
          WHERE s.evt_executing_account = 'dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN'
              AND s.evt_block_time >= from_unixtime({{start}})
              AND s.evt_block_time < from_unixtime({{end}})
      ),
      dbc_results AS (
          SELECT
              'dbc' AS source,
              account_quote_mint AS identifier,
              SUM(COALESCE(trading_fee, 0)) AS fee_1,
              SUM(COALESCE(protocol_fee, 0)) AS fee_2,
              SUM(COALESCE(referral_fee, 0)) AS fee_3,
              CAST(0 AS DECIMAL(38,0)) AS fee_4
          FROM dbc_swap_events
          GROUP BY account_quote_mint
      ),
      migration_configs AS (
          SELECT DISTINCT
              account_config,
              account_pool
          FROM meteora_solana.dynamic_bonding_curve_call_migration_damm_v2
          WHERE account_config IN ('{{config}}')
      ),
      damm_swap_events AS (
          SELECT
              s.pool,
              m.account_config,
              CAST(JSON_EXTRACT_SCALAR(s.swap_result, '$.SwapResult.lp_fee') AS DECIMAL(38,0)) AS lp_fee,
              CAST(JSON_EXTRACT_SCALAR(s.swap_result, '$.SwapResult.protocol_fee') AS DECIMAL(38,0)) AS protocol_fee,
              CAST(JSON_EXTRACT_SCALAR(s.swap_result, '$.SwapResult.partner_fee') AS DECIMAL(38,0)) AS partner_fee,
              CAST(JSON_EXTRACT_SCALAR(s.swap_result, '$.SwapResult.referral_fee') AS DECIMAL(38,0)) AS referral_fee
          FROM meteora_solana.cp_amm_evt_evtswap s
          JOIN migration_configs m ON s.pool = m.account_pool
          WHERE s.evt_block_time >= from_unixtime({{start}})
              AND s.evt_block_time < from_unixtime({{end}})

          UNION ALL

          SELECT
              s.pool,
              m.account_config,
              CAST(JSON_EXTRACT_SCALAR(s.swap_result, '$.SwapResult2.trading_fee') AS DECIMAL(38,0)) AS lp_fee,
              CAST(JSON_EXTRACT_SCALAR(s.swap_result, '$.SwapResult2.protocol_fee') AS DECIMAL(38,0)) AS protocol_fee,
              CAST(JSON_EXTRACT_SCALAR(s.swap_result, '$.SwapResult2.partner_fee') AS DECIMAL(38,0)) AS partner_fee,
              CAST(JSON_EXTRACT_SCALAR(s.swap_result, '$.SwapResult2.referral_fee') AS DECIMAL(38,0)) AS referral_fee
          FROM meteora_solana.cp_amm_evt_evtswap2 s
          JOIN migration_configs m ON s.pool = m.account_pool
          WHERE s.evt_block_time >= from_unixtime({{start}})
              AND s.evt_block_time < from_unixtime({{end}})
      ),
      damm_results AS (
          SELECT
              'dammv2' AS source,
              account_config AS identifier,
              SUM(COALESCE(lp_fee, 0)) AS fee_1,
              SUM(COALESCE(protocol_fee, 0)) AS fee_2,
              SUM(COALESCE(partner_fee, 0)) AS fee_3,
              SUM(COALESCE(referral_fee, 0)) AS fee_4
          FROM damm_swap_events
          GROUP BY account_config
      )
      SELECT source, identifier, fee_1, fee_2, fee_3, fee_4 FROM dbc_results
      UNION ALL
      SELECT source, identifier, fee_1, fee_2, fee_3, fee_4 FROM damm_results
`;

const getSqlFromString = (
  sql: string,
  variables: Record<string, any> = {}
): string => {
  Object.entries(variables).forEach(([key, value]) => {
    sql = sql.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), String(value));
  });
  return sql;
};

const quote_mint = "So11111111111111111111111111111111111111112";
const config = [
  "7UMR4yEaVYsQGbQGvxNUypFmPn15GkzVmwUEpUFJUPPX",
  "7UNpFBfTdWrcfS7aBQzEaPgZCfPJe8BDgHzwmWUZaMaF",
  "7UQpAg2GfvwnBhuNAF5g9ujjDmkq7rPnF7Xogs4xE9AA",
  "7UP2hcAoYvyzumQv3BtvmXDCQk2WoqMEXKym8cCdLAh6",
];

const fetch = async (options: FetchOptions) => {
  const query = getSqlFromString(combinedSQL, {
    config: config.join("','"),
    start: options.startTimestamp,
    end: options.endTimestamp,
  });

  const data: { source: string; identifier: string; fee_1: number; fee_2: number; fee_3: number; fee_4: number }[] = await queryDuneSql(options, query);
  const dbcData = data.filter(r => r.source === 'dbc');
  const dammv2Data = data.filter(r => r.source === 'dammv2');

  const dailyFees = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  // DBC — fee_1 = trading_fee, fee_2 = protocol_fee, fee_3 = referral_fee
  dbcData.forEach((row) => {
    dailyFees.add(row.identifier, Number(row.fee_1), metrics.TradingFees);
    dailyFees.add(row.identifier, Number(row.fee_2), metrics.ProtocolFees);
    dailyFees.add(row.identifier, Number(row.fee_3), metrics.ReferralFees);

    dailySupplySideRevenue.add(row.identifier, Number(row.fee_3), metrics.ReferralFees);
    dailyProtocolRevenue.add(row.identifier, Number(row.fee_1), metrics.TradingFees);
    dailyProtocolRevenue.add(row.identifier, Number(row.fee_2), metrics.ProtocolFees);
  });

  // DAMM v2 — fee_1 = lp_fee, fee_2 = protocol_fee, fee_3 = partner_fee, fee_4 = referral_fee
  dammv2Data.forEach((row) => {
    dailyFees.add(quote_mint, Number(row.fee_1), metrics.TradingFees);
    dailyFees.add(quote_mint, Number(row.fee_3), metrics.PartnerFees);
    dailyFees.add(quote_mint, Number(row.fee_2), metrics.ProtocolFees);
    dailyFees.add(quote_mint, Number(row.fee_4), metrics.ReferralFees);

    dailySupplySideRevenue.add(quote_mint, Number(row.fee_4), metrics.ReferralFees);
    dailySupplySideRevenue.add(quote_mint, Number(row.fee_3), metrics.PartnerFees);

    dailyProtocolRevenue.add(quote_mint, Number(row.fee_1), metrics.TradingFees);
    dailyProtocolRevenue.add(quote_mint, Number(row.fee_2), metrics.ProtocolFees);
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
  fetch,
  chains: [CHAIN.SOLANA],
  start: "2025-06-05",
  dependencies: [Dependencies.DUNE],
  isExpensiveAdapter: true,
  methodology: {
    Fees: "Total trading fees paid by users.",
    UserFees: "Total trading fees paid by users.",
    Revenue: "Fees collected by Trends, including trendor rewards.",
    ProtocolRevenue: "All fees collected by Trends, including trendor rewards.",
    SupplySideRevenue: "Amount of fees shared to referrals and partners.",
  },
  breakdownMethodology: {
    Fees: {
      [metrics.TradingFees]: 'Total trading fees paid by users.',
      [metrics.PartnerFees]: 'Amount of fees paid to partners.',
      [metrics.ReferralFees]: 'Amount of fees paid to referrals.',
      [metrics.ProtocolFees]: 'Amount of fees paid to Trends protocol.',
    },
    Revenue: {
      [metrics.TradingFees]: 'Total trading fees paid by users.',
      [metrics.ProtocolFees]: 'Total fees paid to Trends protocol.',
    },
    ProtocolRevenue: {
      [metrics.TradingFees]: 'Total trading fees paid by users.',
      [metrics.ProtocolFees]: 'Total fees paid to Trends protocol.',
    },
    SupplySideRevenue: {
      [metrics.ReferralFees]: 'Share of trading fees to referrals.',
      [metrics.PartnerFees]: 'Share of trading fees to partners.',
    },
  }
};

export default adapter;
