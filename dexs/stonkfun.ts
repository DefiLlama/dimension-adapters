import { CHAIN } from "../helpers/chains";
import { queryDuneSql } from "../helpers/dune";
import { Adapter, Dependencies, FetchOptions } from "../adapters/types";

// Receives the platform fee of every StonkFun launch on Raydium LaunchLab. Other platform configs
// carry the StonkFun name in their metadata but pay themselves, so the wallet is the identity here.
const PLATFORM_FEE_WALLET = "AvVCE7Ue49iZjYzkkHz6ZhVyvY6NLHw67vB8eQaffVPz";

type Row = { quote_mint: string; volume: string };

const fetch = async (options: FetchOptions) => {
  const rows = (await queryDuneSql(
    options,
    `
    WITH stonkfun_configs AS (
      SELECT account_platform_config AS config
      FROM raydium_solana.raydium_launchpad_call_create_platform_config
      WHERE account_platform_fee_wallet = '${PLATFORM_FEE_WALLET}'
    ),
    launchpad_pools AS (
      SELECT p.pool_state, p.quote_mint
      FROM (
        -- StonkFun's first platform config dates from here, so nothing older can be one of its pools
        SELECT account_pool_state AS pool_state, account_quote_mint AS quote_mint, account_platform_config AS config
        FROM raydium_solana.raydium_launchpad_call_initialize
        WHERE call_block_time >= DATE '2026-08-21'
        UNION ALL
        SELECT account_pool_state, account_quote_mint, account_platform_config
        FROM raydium_solana.raydium_launchpad_call_initialize_v2
        WHERE call_block_time >= DATE '2026-08-21'
        UNION ALL
        SELECT account_pool_state, account_quote_mint, account_platform_config
        FROM raydium_solana.raydium_launchpad_call_initialize_with_token_2022
        WHERE call_block_time >= DATE '2026-08-21'
      ) p
      JOIN stonkfun_configs c ON c.config = p.config
    )
    SELECT
      l.quote_mint AS quote_mint,
      CAST(SUM(CASE WHEN t.trade_direction LIKE '%Buy%' THEN t.amount_in ELSE t.amount_out END) AS VARCHAR) AS volume
    FROM raydium_solana.raydium_launchpad_evt_tradeevent t
    JOIN launchpad_pools l ON l.pool_state = t.pool_state
    WHERE t.evt_block_time >= from_unixtime(${options.startTimestamp})
      AND t.evt_block_time <  from_unixtime(${options.endTimestamp})
    GROUP BY l.quote_mint
  `
  )) as Row[];

  const dailyVolume = options.createBalances();
  rows.forEach(({ quote_mint, volume }) => dailyVolume.add(quote_mint, volume));

  return { dailyVolume };
};

const adapter: Adapter = {
  version: 1,
  dependencies: [Dependencies.DUNE],
  isExpensiveAdapter: true,
  doublecounted: true, // LaunchLab reports the same bonding curve trades.
  methodology: {
    Volume: "Quote-token value of every buy and sell on the Raydium LaunchLab bonding curves configured by StonkFun, denominated in each pool's quote token (SOL, ZEC, wBTC, xStocks, STONK, ...).",
  },
  adapter: {
    [CHAIN.SOLANA]: { fetch, start: "2026-08-21" },
  },
};

export default adapter;
