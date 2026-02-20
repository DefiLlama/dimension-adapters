import ADDRESSES from '../../helpers/coreAssets.json'
import { CHAIN } from '../../helpers/chains'
import { queryDuneSql } from '../../helpers/dune'
import { Dependencies, FetchOptions, SimpleAdapter } from '../../adapters/types'

const fetch = async (_: any, _b: any, options: FetchOptions) => {
  const dailyFees = options.createBalances();

  const query = `
    WITH initialize_v2_mints AS (
      SELECT DISTINCT account_pool_state
      FROM raydium_solana.raydium_launchpad_call_initialize_v2
      WHERE account_platform_config = 'DDLPBBK1rSRcfzJJtgduV2sx3nDthrFARWUB7nkaza6H'
        AND account_pool_state IS NOT NULL
    ),

    launchpad_v2_daily AS (
      SELECT
        CAST(t.evt_block_time AS DATE) AS day,
        SUM(
          TRY_CAST(t.platform_fee AS DECIMAL)
          + TRY_CAST(t.protocol_fee AS DECIMAL)
          + TRY_CAST(t.creator_fee AS DECIMAL)
        ) / 1e9 AS fee,
        SUM(TRY_CAST(t.platform_fee AS DECIMAL)) / 1e9 AS revenue
      FROM raydium_solana.raydium_launchpad_evt_tradeevent t
      JOIN initialize_v2_mints i ON t.pool_state = i.account_pool_state
      WHERE t.evt_block_time >= from_unixtime(${options.startTimestamp})
        AND t.evt_block_time <= from_unixtime(${options.endTimestamp})
      GROUP BY 1
    ),

    pool_states AS (
      SELECT account_cpswap_pool AS pool_state
      FROM raydium_solana.raydium_launchpad_call_migrate_to_cpswap 
      WHERE account_platform_config = 'DDLPBBK1rSRcfzJJtgduV2sx3nDthrFARWUB7nkaza6H'
    ),

    base_input AS (
      SELECT
        s.account_poolState,
        s.amountIn AS trade_size,
        s.call_block_time
      FROM raydium_cp_solana.raydium_cp_swap_call_swapbaseinput s
      INNER JOIN pool_states ps ON ps.pool_state = s.account_poolState
      WHERE s.account_inputTokenMint = 'So11111111111111111111111111111111111111112'
        AND s.call_block_time >= from_unixtime(${options.startTimestamp})
        AND s.call_block_time <= from_unixtime(${options.endTimestamp})
    ),

    base_output AS (
      SELECT
        s.account_poolState,
        s.amountOut AS trade_size,
        s.call_block_time
      FROM raydium_cp_solana.raydium_cp_swap_call_swapbaseoutput s
      INNER JOIN pool_states ps ON ps.pool_state = s.account_poolState
      WHERE s.account_outputTokenMint = 'So11111111111111111111111111111111111111112'
        AND s.call_block_time >= from_unixtime(${options.startTimestamp})
        AND s.call_block_time <= from_unixtime(${options.endTimestamp})
    ),

    all_trades AS (
      SELECT trade_size, call_block_time FROM base_input
      UNION ALL
      SELECT trade_size, call_block_time FROM base_output
    ),

    cpswap_daily AS (
      SELECT
        DATE_TRUNC('day', call_block_time) AS day,
        SUM(trade_size * 0.0105) / 1e9 AS fee,
        SUM(trade_size * 0.004452) / 1e9 AS revenue
      FROM all_trades
      GROUP BY 1
    )

    -- Final union of launchpad v2 + cpswap
    SELECT
      day,
      SUM(fee) AS fee,
      SUM(revenue) AS revenue
    FROM (
      SELECT * FROM launchpad_v2_daily
      UNION ALL
      SELECT * FROM cpswap_daily
    ) combined
    GROUP BY day
    ORDER BY day;
  `;

  const data = await queryDuneSql(options, query);
  
  if (!data || data.length === 0) {
    throw new Error('No data found for the current date');
  }

  const result = data[0];
  const totalFeesLamports = result.fee * 1e9;
  const totalRevenueLamports = result.revenue * 1e9;

  dailyFees.add(ADDRESSES.solana.SOL, totalFeesLamports);
  
  const dailyRevenue = options.createBalances();
  dailyRevenue.add(ADDRESSES.solana.SOL, totalRevenueLamports);

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue: dailyRevenue,
    dailyHoldersRevenue: 0
  };
};

const adapter: SimpleAdapter = {
  dependencies: [Dependencies.DUNE],
  methodology: {
    // https://docs.zapzy.io/sections/zapzy/fees-and-rewards#before-bonding-1-25%25
    Fees: "Fees are collected from users and distributed to coin creators and the protocol.",
    Revenue: "50% of fees go to the protocol.",
    SupplySideRevenue: "50% of fees are distributed to coin creators.",
  },
  adapter: {
    [CHAIN.SOLANA]: {
      fetch,
      start: '2025-08-27',
    }
  }
};

export default adapter;