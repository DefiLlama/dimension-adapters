// Incognito Launchpad (https://incognitolaunchpad.com) launches coins on Raydium LaunchLab under its own platform config.
// Fees: the launchpad's platform fee and the creator fee on LaunchLab bonding-curve trades, plus the quote-side fees of graduated launches'
// permanently locked liquidity, harvested with the Fee Key the launchpad holds. Modelled on fees/vibesfun.ts and fees/launchlab/index.ts;
// the fee wallet is read from the platform config's own creation call.
import { Adapter, Dependencies, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryDuneSql } from "../helpers/dune";
import { METRIC } from "../helpers/metrics";

// Incognito Launchpad launches coins on Raydium LaunchLab under its own platform config, which identifies the protocol. The config's fee wallet
// collects the platform fee and receives the Fee Key of every graduated launch; the query reads it from the config's creation call.
const PLATFORM_CONFIG = "FtTaVwmhxc99Lb39mvuoRn8HkafVTJqRtoXeRTTXczpe";
// Raydium Burn & Earn: graduated launches lock their CPMM liquidity here and pay its fees to the Fee Key.
const LOCK_PROGRAM = "LockrWmn6K5twhz3y9w1dQERbmgSaRkfnTeTKbpofwE";
// The platform config was created on 2026-10-03.
const START = "2026-10-03";

type Row = { kind: string; mint: string; raw_amount: string };

const fetch = async (options: FetchOptions) => {
  const rows = (await queryDuneSql(
    options,
    `
    WITH pad_configs AS (
      SELECT account_platform_config AS config, account_platform_fee_wallet AS fee_wallet
      FROM raydium_solana.raydium_launchpad_call_create_platform_config
      WHERE account_platform_config = '${PLATFORM_CONFIG}'
    ),
    launchpad_pools AS (
      SELECT p.pool_state, p.quote_mint
      FROM (
        SELECT account_pool_state AS pool_state, account_quote_mint AS quote_mint, account_platform_config AS config
        FROM raydium_solana.raydium_launchpad_call_initialize
        WHERE call_block_time >= DATE '${START}'
        UNION ALL
        SELECT account_pool_state, account_quote_mint, account_platform_config
        FROM raydium_solana.raydium_launchpad_call_initialize_v2
        WHERE call_block_time >= DATE '${START}'
        UNION ALL
        SELECT account_pool_state, account_quote_mint, account_platform_config
        FROM raydium_solana.raydium_launchpad_call_initialize_with_token_2022
        WHERE call_block_time >= DATE '${START}'
      ) p
      JOIN pad_configs c ON c.config = p.config
    ),
    graduated_quote_vaults AS (
      SELECT m.account_cpswap_quote_vault AS vault
      FROM raydium_solana.raydium_launchpad_call_migrate_to_cpswap m
      JOIN pad_configs c ON c.config = m.account_platform_config
      WHERE m.call_block_time >= DATE '${START}'
    ),
    harvests AS (
      SELECT t.token_mint_address AS mint, t.amount
      FROM tokens_solana.transfers t
      JOIN graduated_quote_vaults v ON v.vault = t.from_token_account
      WHERE t.outer_executing_account = '${LOCK_PROGRAM}'
        AND t.to_owner IN (SELECT fee_wallet FROM pad_configs)
        AND t.block_time >= from_unixtime(${options.startTimestamp})
        AND t.block_time <  from_unixtime(${options.endTimestamp})
    )
    SELECT 'platform_fee' AS kind, l.quote_mint AS mint, CAST(SUM(t.platform_fee) AS VARCHAR) AS raw_amount
    FROM raydium_solana.raydium_launchpad_evt_tradeevent t
    JOIN launchpad_pools l ON l.pool_state = t.pool_state
    WHERE t.evt_block_time >= from_unixtime(${options.startTimestamp})
      AND t.evt_block_time <  from_unixtime(${options.endTimestamp})
    GROUP BY l.quote_mint
    UNION ALL
    SELECT 'creator_fee' AS kind, l.quote_mint AS mint, CAST(SUM(t.creator_fee) AS VARCHAR) AS raw_amount
    FROM raydium_solana.raydium_launchpad_evt_tradeevent t
    JOIN launchpad_pools l ON l.pool_state = t.pool_state
    WHERE t.evt_block_time >= from_unixtime(${options.startTimestamp})
      AND t.evt_block_time <  from_unixtime(${options.endTimestamp})
    GROUP BY l.quote_mint
    UNION ALL
    SELECT 'locked_lp_fee' AS kind, mint, CAST(SUM(amount) AS VARCHAR) AS raw_amount
    FROM harvests
    GROUP BY mint
  `
  )) as Row[];

  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  for (const row of rows) {
    const amount = BigInt(row.raw_amount || 0);
    if (amount === 0n) continue;
    if (row.kind === "locked_lp_fee") {
      dailyFees.add(row.mint, amount, METRIC.LP_FEES);
      dailyRevenue.add(row.mint, amount, "LP Fees To Protocol");
      continue;
    }
    // the platform fee and the creator fee are both charged on the same bonding-curve trade
    dailyFees.add(row.mint, amount, METRIC.TRADING_FEES);
    if (row.kind === "creator_fee") dailySupplySideRevenue.add(row.mint, amount, "Trading Fees To Creators");
    else dailyRevenue.add(row.mint, amount, "Trading Fees To Protocol");
  }

  return { dailyFees, dailyUserFees: dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue, dailySupplySideRevenue };
};

const methodology = {
  Fees: "Fees paid by traders of coins launched on Incognito Launchpad (Solana): the launchpad's 0.25% platform fee and the coin creator's 0.5% fee on every trade against the Raydium LaunchLab bonding curves it configures, and, once a coin graduates, the quote-side trading fees of its permanently locked liquidity, harvested with the Fee Key the launchpad holds. Raydium's own protocol fee is excluded. Amounts are in each pool's quote token.",
  UserFees: "The launchpad's 0.25% platform fee and the creator's 0.5% fee on every Incognito Launchpad bonding-curve trade, plus the quote-side trading fees of graduated launches' locked liquidity, all paid by traders.",
  Revenue: "The platform fee and the harvested locked-liquidity fees, both received by the launchpad treasury.",
  ProtocolRevenue: "The 0.25% platform fee on bonding-curve trades and the harvested locked-liquidity fees, all sent to the launchpad treasury.",
  SupplySideRevenue: "The creator fee of each bonding-curve trade, paid to the wallet that launched the coin.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.TRADING_FEES]: "0.75% of every LaunchLab bonding curve trade on an Incognito launch (0.25% platform fee plus 0.5% creator fee), charged in the pool's quote token.",
    [METRIC.LP_FEES]: "Quote-token fees harvested from the locked liquidity of graduated Incognito launches.",
  },
  Revenue: {
    "Trading Fees To Protocol": "The 0.25% platform fee on bonding curve trades, kept by the launchpad.",
    "LP Fees To Protocol": "The harvested locked-liquidity fees, kept by the launchpad.",
  },
  ProtocolRevenue: {
    "Trading Fees To Protocol": "The 0.25% platform fee on bonding curve trades, sent to the launchpad treasury.",
    "LP Fees To Protocol": "The harvested locked-liquidity fees, sent to the launchpad treasury.",
  },
  SupplySideRevenue: {
    "Trading Fees To Creators": "The 0.5% creator fee on bonding curve trades, paid to the wallet that launched the coin.",
  },
};

const adapter: Adapter = {
  version: 1,
  dependencies: [Dependencies.DUNE],
  fetch,
  chains: [CHAIN.SOLANA],
  start: START,
  isExpensiveAdapter: true,
  doublecounted: true, // LaunchLab and Raydium report the same swap fees.
  methodology,
  breakdownMethodology,
};

export default adapter;
