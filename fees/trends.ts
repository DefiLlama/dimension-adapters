import { Dependencies, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getSqlFromFile, queryDuneSql } from "../helpers/dune";
import { FetchOptions } from "../adapters/types";

interface IData {
  quote_mint: string;
  total_volume: number;
  total_trading_fees: number;
  total_protocol_fees: number;
  total_referral_fees: number;
}

interface IDammv2Data {
  account_config: string;
  total_lp_fees: number;
  total_partner_fees: number;
  total_protocol_fees: number;
  total_referral_fees: number;
}

const dbcSQL = `
WITH
    dbc_tokens AS (
        SELECT DISTINCT
            account_config,
            account_quote_mint
        FROM meteora_solana.dynamic_bonding_curve_call_initialize_virtual_pool_with_token2022
        WHERE account_config IN ('{{config}}')
    ),
    swap_events AS (
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
    )
SELECT
    account_quote_mint as quote_mint,
    SUM(COALESCE(trading_fee, 0)) AS total_trading_fees,
    SUM(COALESCE(protocol_fee, 0)) AS total_protocol_fees,
    SUM(COALESCE(referral_fee, 0)) AS total_referral_fees
FROM swap_events
GROUP BY account_quote_mint
`;

const dammV2SQL = `
WITH
    migration_configs AS (
        SELECT DISTINCT
            account_config,
            account_pool
        FROM meteora_solana.dynamic_bonding_curve_call_migration_damm_v2
        WHERE account_config IN ('{{config}}')
    ),
    swap_events AS (
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
    )
SELECT
    account_config,
    SUM(COALESCE(lp_fee, 0)) AS total_lp_fees,
    SUM(COALESCE(protocol_fee, 0)) AS total_protocol_fees,
    SUM(COALESCE(partner_fee, 0)) AS total_partner_fees,
    SUM(COALESCE(referral_fee, 0)) AS total_referral_fees
FROM swap_events
GROUP BY account_config
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
];

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const query = getSqlFromString(dbcSQL, {
    config: config.join("','"),
    start: options.startTimestamp,
    end: options.endTimestamp,
  });
  const dammv2Query = getSqlFromString(dammV2SQL, {
    config: config.join("','"),
    start: options.startTimestamp,
    end: options.endTimestamp,
  });

  const data: IData[] = await queryDuneSql(options, query);
  const dammv2Data: IDammv2Data[] = await queryDuneSql(options, dammv2Query);
  const dailyFees = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();

  data.forEach((row) => {
    const totalFees =
      Number(row.total_trading_fees) +
      Number(row.total_protocol_fees) +
      Number(row.total_referral_fees);

    dailyFees.add(row.quote_mint, Number(totalFees));
    dailyProtocolRevenue.add(row.quote_mint, Number(row.total_trading_fees));
  });

  dammv2Data.forEach((row) => {
    const totalFees =
      Number(row.total_lp_fees) +
      Number(row.total_partner_fees) +
      Number(row.total_protocol_fees) +
      Number(row.total_referral_fees);

    dailyFees.add(quote_mint, Number(totalFees));
    dailyProtocolRevenue.add(quote_mint, Number(row.total_lp_fees));
  });

  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue: dailyProtocolRevenue,
    dailyProtocolRevenue,
  };
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.SOLANA],
  start: "2025-06-05",
  dependencies: [Dependencies.DUNE],
  isExpensiveAdapter: true,
  methodology: {
    Fees: "Total fees paid by users.",
    Revenue: "Fees collected by Trends, including trendor rewards."
  },
};

export default adapter;
