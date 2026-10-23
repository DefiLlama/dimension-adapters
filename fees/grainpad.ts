// Grainpad (https://grainpad.fun) launches tokens on Raydium LaunchLab under its own platform config, mostly paired with wXMR.
// Fees: the launchpad's platform fee and the creator fee on LaunchLab bonding-curve trades, plus the quote-side fees of graduated launches'
// permanently locked liquidity, harvested with the Fee Keys Grainpad holds. Modelled on fees/incognito-launchpad.ts.
// Token transfer taxes on Grainpad reward launches are not counted.
import { Adapter, Dependencies, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryDuneSql } from "../helpers/dune";
import { METRIC } from "../helpers/metrics";

// Grainpad's LaunchLab platform config, published on https://grainpad.fun/docs#verification.
const PLATFORM_CONFIG = "d9EBYYKcBccQoZWn9uMHnmbMw8PVh46WXrKZFpYaKoV";
// LaunchLab assigns the Fee Key of every graduated launch to the config's NFT wallet: Grainpad's collector wallet (BxJZ…, the current
// value on-chain) or, for earlier launches, Grainpad's admin wallet (FuAq…, published on https://grainpad.fun/docs#verification).
const FEE_KEY_WALLETS = ["BxJZSApDy7i4VVAQSRCL5FQJ2RCCP676PUWKYEcY1Z6i", "FuAqW3zEPjVFVeE8ditPabjU5iJbF3BzE2i4djrvWQFM"];
// Raydium Burn & Earn: graduated launches lock their CPMM liquidity here and pay its fees to the Fee Key.
const LOCK_PROGRAM = "LockrWmn6K5twhz3y9w1dQERbmgSaRkfnTeTKbpofwE";
// The platform config was created on 2026-09-29.
const START = "2026-09-29";

type Row = { kind: string; mint: string; raw_amount: string };

const fetch = async (options: FetchOptions) => {
  const rows = (await queryDuneSql(
    options,
    `
    WITH launchpad_pools AS (
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
      WHERE p.config = '${PLATFORM_CONFIG}'
    ),
    graduated_quote_vaults AS (
      SELECT account_cpswap_quote_vault AS vault
      FROM raydium_solana.raydium_launchpad_call_migrate_to_cpswap
      WHERE account_platform_config = '${PLATFORM_CONFIG}'
        AND call_block_time >= DATE '${START}'
    ),
    harvests AS (
      SELECT t.token_mint_address AS mint, t.amount
      FROM tokens_solana.transfers t
      JOIN graduated_quote_vaults v ON v.vault = t.from_token_account
      WHERE t.outer_executing_account = '${LOCK_PROGRAM}'
        AND t.to_owner IN (${FEE_KEY_WALLETS.map((w) => `'${w}'`).join(", ")})
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
  Fees: "Fees paid by traders of tokens launched on Grainpad (Solana): Grainpad's platform fee (0.75% under its current config) and the token creator's fee (0.25%) on every trade against the Raydium LaunchLab bonding curves it configures, and, once a token graduates, the quote-side trading fees of its permanently locked liquidity, harvested with the Fee Keys Grainpad holds. Raydium's own protocol fee and the token transfer taxes of Grainpad reward launches are excluded. Amounts are in each pool's quote token, mostly wXMR.",
  UserFees: "Grainpad's platform fee and the creator's fee on every Grainpad bonding-curve trade, plus the quote-side trading fees of graduated launches' locked liquidity, all paid by traders.",
  Revenue: "The platform fee and the harvested locked-liquidity fees, both received by Grainpad.",
  ProtocolRevenue: "The platform fee on bonding-curve trades and the harvested locked-liquidity fees, all received by Grainpad.",
  SupplySideRevenue: "The creator fee of each bonding-curve trade, paid to the wallet that launched the token.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.TRADING_FEES]: "Platform fee plus creator fee on every LaunchLab bonding-curve trade of a Grainpad launch (1% under the current config), charged in the pool's quote token.",
    [METRIC.LP_FEES]: "Quote-token fees harvested from the locked liquidity of graduated Grainpad launches.",
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
