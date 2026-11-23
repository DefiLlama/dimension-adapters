import { CHAIN } from "../helpers/chains";
import { queryDuneSql } from "../helpers/dune";
import { assertDuneSolanaIndexed } from "../helpers/duneSolanaDex";
import { Adapter, Dependencies, FetchOptions } from "../adapters/types";

// GreenDildo (https://greendildo.fun, https://x.com/LaunchOnDildo) launches every coin on Raydium LaunchLab
// under its own platform config, so the config is the identity here.
const PLATFORM_CONFIG = "8JSqtCbKGBb4XDvMrHMiaKTaYWiy8s5dFuu8yH2UL3Zm";

type Row = { quote_mint: string; volume: string };

const fetch = async (options: FetchOptions) => {
  assertDuneSolanaIndexed(options);

  const rows = (await queryDuneSql(
    options,
    `
    WITH launchpad_pools AS (
      -- GreenDildo's platform config dates from here, so nothing older can be one of its pools
      SELECT account_pool_state AS pool_state, account_quote_mint AS quote_mint
      FROM raydium_solana.raydium_launchpad_call_initialize
      WHERE call_block_time >= DATE '2026-11-01' AND account_platform_config = '${PLATFORM_CONFIG}'
      UNION ALL
      SELECT account_pool_state, account_quote_mint
      FROM raydium_solana.raydium_launchpad_call_initialize_v2
      WHERE call_block_time >= DATE '2026-11-01' AND account_platform_config = '${PLATFORM_CONFIG}'
      UNION ALL
      SELECT account_pool_state, account_quote_mint
      FROM raydium_solana.raydium_launchpad_call_initialize_with_token_2022
      WHERE call_block_time >= DATE '2026-11-01' AND account_platform_config = '${PLATFORM_CONFIG}'
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
    Volume: "Quote-token value of every buy and sell on the Raydium LaunchLab bonding curves created under the GreenDildo platform config, denominated in each pool's quote token.",
  },
  fetch,
  chains: [CHAIN.SOLANA],
  start: "2026-11-09",
};

export default adapter;
