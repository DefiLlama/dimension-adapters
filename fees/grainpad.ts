// Grainpad (https://grainpad.fun) launches tokens on Raydium LaunchLab under its own platform config, mostly paired with wXMR.
// Fees: the launchpad's platform fee and the creator fee on LaunchLab bonding-curve trades, plus the quote-side fees of graduated launches'
// permanently locked liquidity, harvested with the Fee Keys Grainpad holds, and the creator fee those graduated pools pay their
// launch's creator, counted when claimed. Modelled on fees/incognito-launchpad.ts and fees/stonkfun.ts.
// Token transfer taxes on Grainpad reward launches are not counted.
import { Adapter, Dependencies, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryDuneSql } from "../helpers/dune";
import { assertDuneSolanaIndexed } from "../helpers/duneSolanaDex";
import { METRIC } from "../helpers/metrics";

// Grainpad's LaunchLab platform config, published on https://grainpad.fun/docs#verification.
const PLATFORM_CONFIG = "d9EBYYKcBccQoZWn9uMHnmbMw8PVh46WXrKZFpYaKoV";
// LaunchLab assigns the Fee Key of every graduated launch to the config's NFT wallet: Grainpad's collector wallet (BxJZ…, the current
// value on-chain) or, for earlier launches, Grainpad's admin wallet (FuAq…, published on https://grainpad.fun/docs#verification).
const FEE_KEY_WALLETS = ["BxJZSApDy7i4VVAQSRCL5FQJ2RCCP676PUWKYEcY1Z6i", "FuAqW3zEPjVFVeE8ditPabjU5iJbF3BzE2i4djrvWQFM"];
// Raydium Burn & Earn: graduated launches lock their CPMM liquidity here and pay its fees to the Fee Key.
const LOCK_PROGRAM = "LockrWmn6K5twhz3y9w1dQERbmgSaRkfnTeTKbpofwE";
// Raydium CPMM. Graduated launches carry a creator fee on the quote side, which the launch's creator claims from the pool's quote vault.
const CPMM_PROGRAM = "CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C";
const CPMM_AUTHORITY = "GpMZbSM2GgvTKHJirzeGfMFoaZ8UR2X7F4v8vHTvxFbL";
// The platform config was created on 2026-09-29.
const START = "2026-09-29";

type Row = { kind: string; mint: string; raw_amount: string };

const fetch = async (options: FetchOptions) => {
  assertDuneSolanaIndexed(options);

  const rows = (await queryDuneSql(
    options,
    `
    WITH launchpad_pools AS (
      SELECT p.pool_state, p.quote_mint, p.creator
      FROM (
        SELECT account_pool_state AS pool_state, account_quote_mint AS quote_mint, account_platform_config AS config, account_creator AS creator
        FROM raydium_solana.raydium_launchpad_call_initialize
        WHERE call_block_time >= DATE '${START}'
        UNION ALL
        SELECT account_pool_state, account_quote_mint, account_platform_config, account_creator
        FROM raydium_solana.raydium_launchpad_call_initialize_v2
        WHERE call_block_time >= DATE '${START}'
        UNION ALL
        SELECT account_pool_state, account_quote_mint, account_platform_config, account_creator
        FROM raydium_solana.raydium_launchpad_call_initialize_with_token_2022
        WHERE call_block_time >= DATE '${START}'
      ) p
      WHERE p.config = '${PLATFORM_CONFIG}'
    ),
    graduated_pools AS (
      SELECT m.account_cpswap_quote_vault AS quote_vault, m.account_cpswap_base_vault AS base_vault, l.creator
      FROM raydium_solana.raydium_launchpad_call_migrate_to_cpswap m
      LEFT JOIN launchpad_pools l ON l.pool_state = m.account_pool_state
      WHERE m.account_platform_config = '${PLATFORM_CONFIG}'
        AND m.call_block_time >= DATE '${START}'
    ),
    harvests AS (
      SELECT t.token_mint_address AS mint, t.amount
      FROM tokens_solana.transfers t
      JOIN graduated_pools v ON v.quote_vault = t.from_token_account
      WHERE t.outer_executing_account = '${LOCK_PROGRAM}'
        AND t.to_owner IN (${FEE_KEY_WALLETS.map((w) => `'${w}'`).join(", ")})
        AND t.block_time >= from_unixtime(${options.startTimestamp})
        AND t.block_time <  from_unixtime(${options.endTimestamp})
    ),
    -- Token movements of direct CPMM calls that touch a graduated Grainpad pool's vaults.
    cpmm_moves AS (
      SELECT t.tx_id, t.token_mint_address AS mint, t.amount, t.from_owner, t.to_owner,
        q.quote_vault IS NOT NULL AS from_quote_vault, q.creator AS pool_creator, b.base_vault IS NOT NULL AS from_base_vault
      FROM tokens_solana.transfers t
      LEFT JOIN graduated_pools q ON q.quote_vault = t.from_token_account
      LEFT JOIN graduated_pools b ON b.base_vault = t.from_token_account
      WHERE t.outer_executing_account = '${CPMM_PROGRAM}'
        AND t.block_time >= from_unixtime(${options.startTimestamp})
        AND t.block_time <  from_unixtime(${options.endTimestamp})
    ),
    -- A creator fee claim only moves quote out of the pool to the launch's creator. Swaps also pay into a pool and
    -- liquidity withdrawals also move the base token out, so transactions with either are skipped.
    creator_claims AS (
      SELECT mint, amount
      FROM (
        SELECT *, bool_or(to_owner = '${CPMM_AUTHORITY}' OR from_base_vault) OVER (PARTITION BY tx_id) AS not_a_claim
        FROM cpmm_moves
      ) c
      WHERE from_quote_vault
        AND from_owner = '${CPMM_AUTHORITY}'
        AND to_owner = pool_creator
        AND NOT not_a_claim
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
    UNION ALL
    SELECT 'graduated_creator_fee' AS kind, mint, CAST(SUM(amount) AS VARCHAR) AS raw_amount
    FROM creator_claims
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
    if (row.kind === "graduated_creator_fee") {
      dailyFees.add(row.mint, amount, METRIC.CREATOR_FEES);
      dailySupplySideRevenue.add(row.mint, amount, "Graduated Pool Creator Fees To Creators");
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
  Fees: "Fees paid by traders of tokens launched on Grainpad (Solana): Grainpad's platform fee (0.75% under its current config) and the token creator's fee (0.25%) on every trade against the Raydium LaunchLab bonding curves it configures, and, once a token graduates, the quote-side trading fees of its permanently locked liquidity, harvested with the Fee Keys Grainpad holds, plus the creator fee of those graduated pools, counted when the launch's creator claims it. Raydium's own protocol fee and the token transfer taxes of Grainpad reward launches are excluded. Amounts are in each pool's quote token, mostly wXMR.",
  UserFees: "Grainpad's platform fee and the creator's fee on every Grainpad bonding-curve trade, plus the quote-side trading fees of graduated launches' locked liquidity and the creator fee of their pools, all paid by traders.",
  Revenue: "The platform fee and the harvested locked-liquidity fees, both received by Grainpad.",
  ProtocolRevenue: "The platform fee on bonding-curve trades and the harvested locked-liquidity fees, all received by Grainpad.",
  SupplySideRevenue: "The creator fee of each bonding-curve trade and of each graduated pool, paid to the wallet that launched the token.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.TRADING_FEES]: "Platform fee plus creator fee on every LaunchLab bonding-curve trade of a Grainpad launch (1% under the current config), charged in the pool's quote token.",
    [METRIC.LP_FEES]: "Quote-token fees harvested from the locked liquidity of graduated Grainpad launches.",
    [METRIC.CREATOR_FEES]: "The quote-side creator fee of graduated Grainpad launches' Raydium CPMM pools, counted when the launch's creator claims it.",
  },
  Revenue: {
    "Trading Fees To Protocol": "The platform fee on bonding-curve trades, kept by Grainpad.",
    "LP Fees To Protocol": "The harvested locked-liquidity fees, kept by Grainpad.",
  },
  ProtocolRevenue: {
    "Trading Fees To Protocol": "The platform fee on bonding-curve trades, received by Grainpad.",
    "LP Fees To Protocol": "The harvested locked-liquidity fees, received by Grainpad.",
  },
  SupplySideRevenue: {
    "Trading Fees To Creators": "The creator fee on bonding-curve trades, paid to the wallet that launched the token.",
    "Graduated Pool Creator Fees To Creators": "The creator fee of graduated pools, claimed by the wallet that launched the token.",
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
