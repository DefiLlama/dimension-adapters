import { Dependencies, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryDuneSql } from "../helpers/dune";
import { FetchOptions } from "../adapters/types";
import { METRIC } from "../helpers/metrics";

interface IData {
  quote_mint: string;
  total_volume: number;
  total_trading_fees: number;
  total_protocol_fees: number;
}

interface IDammv2Data {
  account_config: string;
  total_volume: number;
  total_lp_fees: number;
  total_partner_fees: number;
  total_protocol_fees: number;
}

const PLATFORM_WALLET = "7c8XjugvjW5pMKkrV5myZfoWrQ1QHjwWC3RYZWUToJRk";
const QUOTE_MINT_DEFAULT = "So11111111111111111111111111111111111111112";

const metrics = {
  TradingFees: METRIC.TRADING_FEES,
  PartnerFees: "Partner Fees",
  ProtocolFees: "Protocol Fees",
};

// DBC query, excluding migrated configs
const dbcSQL = `
    WITH migrated_configs AS (
        SELECT DISTINCT account_config
        FROM meteora_solana.dynamic_bonding_curve_call_migration_damm_v2
    ),
    dbc_tokens AS (
        SELECT DISTINCT
            account_config,
            account_quote_mint
        FROM meteora_solana.dynamic_bonding_curve_call_initialize_virtual_pool_with_spl_token
        WHERE account_creator = '{{platformWallet}}'
          AND account_config NOT IN (SELECT account_config FROM migrated_configs)
    ),
    swap_events AS (
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
    )
    SELECT
        account_quote_mint AS quote_mint,
        SUM(
            CASE
                WHEN trade_direction = 1 THEN COALESCE(amount_in, 0)
                ELSE COALESCE(output_amount, 0)
            END
        ) AS total_volume,
        SUM(COALESCE(trading_fee, 0)) AS total_trading_fees,
        SUM(COALESCE(protocol_fee, 0)) AS total_protocol_fees
    FROM swap_events
    GROUP BY account_quote_mint
`;

// DAMM v2 query (migrated pools)
const dammV2SQL = `
WITH
    migration_configs AS (
        SELECT DISTINCT
            account_config,
            account_pool
        FROM meteora_solana.dynamic_bonding_curve_call_migration_damm_v2
        WHERE account_config IN ({{configs}})
    ),
    swap_events AS (
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
    )
SELECT
    account_config,
    SUM(COALESCE(output_amount, 0)) AS total_volume,
    SUM(COALESCE(trading_fee, 0)) AS total_lp_fees,
    SUM(COALESCE(protocol_fee, 0)) AS total_protocol_fees,
    SUM(COALESCE(partner_fee, 0)) AS total_partner_fees
FROM swap_events
GROUP BY account_config
`;

const getSqlFromString = (sql: string, variables: Record<string, any> = {}): string => {
  Object.entries(variables).forEach(([key, value]) => {
    sql = sql.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), String(value));
  });
  return sql;
};

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  // Step 1: Get all configs dynamically
  const configsQuery = `
    SELECT DISTINCT account_config
    FROM meteora_solana.dynamic_bonding_curve_call_initialize_virtual_pool_with_spl_token
    WHERE account_creator = '{{platformWallet}}'
  `;
  const resolvedConfigsQuery = getSqlFromString(configsQuery, { platformWallet: PLATFORM_WALLET });
  const configsResult: { account_config: string }[] = await queryDuneSql(options, resolvedConfigsQuery);

  if (!configsResult.length) {
    const emptyBalances = options.createBalances();
    return {
      dailyFees: emptyBalances,
      dailyUserFees: emptyBalances,
      dailyRevenue: emptyBalances,
      dailyProtocolRevenue: emptyBalances,
      dailyVolume: emptyBalances,
    };
  }

  const configs = configsResult.map(c => `'${c.account_config}'`).join(",");

  // Step 2: Fetch DBC fees (non-migrated only)
  const dbcQuery = getSqlFromString(dbcSQL, {
    platformWallet: PLATFORM_WALLET,
    start: options.startTimestamp,
    end: options.endTimestamp,
  });
  const dbcData: IData[] = await queryDuneSql(options, dbcQuery);

  // Step 3: Fetch DAMM v2 fees (migrated pools)
  const dammv2Query = getSqlFromString(dammV2SQL, {
    configs,
    start: options.startTimestamp,
    end: options.endTimestamp,
  });
  const dammv2Data: IDammv2Data[] = await queryDuneSql(options, dammv2Query);

  // Step 4: Aggregate fees and volume
  const dailyFees = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailyVolume = options.createBalances();

  // DBC
  dbcData.forEach((row) => {
    dailyFees.add(row.quote_mint, Number(row.total_trading_fees), metrics.TradingFees);
    dailyFees.add(row.quote_mint, Number(row.total_protocol_fees), metrics.ProtocolFees);

    dailyProtocolRevenue.add(row.quote_mint, Number(row.total_trading_fees), metrics.TradingFees);
    dailyProtocolRevenue.add(row.quote_mint, Number(row.total_protocol_fees), metrics.ProtocolFees);

    dailyVolume.add(row.quote_mint, Number(row.total_volume) / 2);
  });

  // DAMM v2
  dammv2Data.forEach((row) => {
    const quoteMint = dbcData[0]?.quote_mint ?? QUOTE_MINT_DEFAULT;
    dailyFees.add(quoteMint, Number(row.total_lp_fees), metrics.TradingFees);
    dailyFees.add(quoteMint, Number(row.total_partner_fees), metrics.PartnerFees);
    dailyFees.add(quoteMint, Number(row.total_protocol_fees), metrics.ProtocolFees);

    dailyProtocolRevenue.add(quoteMint, Number(row.total_lp_fees), metrics.TradingFees);
    dailyProtocolRevenue.add(quoteMint, Number(row.total_protocol_fees), metrics.ProtocolFees);

    dailyVolume.add(quoteMint, Number(row.total_volume / 2));
  });

  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue: dailyProtocolRevenue,
    dailyProtocolRevenue,
    dailyVolume,
  };
};

const adapter: SimpleAdapter = {
  fetch,
  chains: [CHAIN.SOLANA],
  start: "2025-11-21",
  dependencies: [Dependencies.DUNE],
  isExpensiveAdapter: true,
  methodology: {
    Fees: "Total trading fees paid by users.",
    UserFees: "Total trading fees paid by users.",
    Revenue: "Fees collected by Trends, including trendor rewards.",
    ProtocolRevenue: "All fees collected by Trends, including trendor rewards.",
    Volume: "Total trading volume in quote tokens.",
  },
  breakdownMethodology: {
    Fees: {
      [metrics.TradingFees]: "Total trading fees paid by users.",
      [metrics.PartnerFees]: "Amount of fees paid to partners.",
      [metrics.ProtocolFees]: "Amount of fees paid to Trends protocol.",
    },
    Revenue: {
      [metrics.TradingFees]: "Total trading fees paid by users.",
      [metrics.ProtocolFees]: "Total fees paid to Trends protocol.",
    },
    ProtocolRevenue: {
      [metrics.TradingFees]: "Total trading fees paid by users.",
      [metrics.ProtocolFees]: "Total fees paid to Trends protocol.",
    },
  },
};

export default adapter;

