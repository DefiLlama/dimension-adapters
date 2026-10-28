import { Adapter, Dependencies, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryDuneSql } from "../helpers/dune";
import { METRIC } from "../helpers/metrics";

// vibes.fun launches coins on Raydium LaunchLab under its own platform config. This wallet is the config's
// fee collector and receives the Fee Key of every graduated launch, so it identifies the protocol: any
// platform config created with it as fee wallet is a vibes.fun config.
const PLATFORM_FEE_WALLET = "3soymF6jF3HG4yRzLxr6t1xsrQRs5sR3oQBEPuF1ZRB6";

// Raydium Burn & Earn. Graduated launches lock their CPMM liquidity here and pay its fees to the Fee Key.
const LOCK_PROGRAM = "LockrWmn6K5twhz3y9w1dQERbmgSaRkfnTeTKbpofwE";

// The first vibes.fun platform config was created on 2026-09-15.
const START = "2026-09-15";

// Published split of every fee vibes.fun collects: 70% is paid to the holders of the coin that generated it
// (or its creator, when the creator chose creator fees), 15% goes to the treasury and 15% buys back and
// burns $VIBES. See https://vibes.fun/#/docs.
const HOLDERS_OF_COIN = 0.7;
const TREASURY = 0.15;
const VIBES_BUYBACK = 0.15;

type Row = { kind: string; mint: string; raw_amount: string };

const fetch = async (options: FetchOptions) => {
  const rows = (await queryDuneSql(
    options,
    `
    WITH vibes_configs AS (
      SELECT account_platform_config AS config
      FROM raydium_solana.raydium_launchpad_call_create_platform_config
      WHERE account_platform_fee_wallet = '${PLATFORM_FEE_WALLET}'
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
      JOIN vibes_configs c ON c.config = p.config
    ),
    -- After graduation the pool's liquidity is locked and its fees are harvested to the Fee Key. A harvest
    -- pays both sides of the pool; only the quote side is revenue. The migration call records which CPMM
    -- vault holds the quote, so harvests are classified exactly.
    graduated_quote_vaults AS (
      SELECT m.account_cpswap_quote_vault AS vault
      FROM raydium_solana.raydium_launchpad_call_migrate_to_cpswap m
      JOIN vibes_configs c ON c.config = m.account_platform_config
      WHERE m.call_block_time >= DATE '${START}'
    ),
    harvests AS (
      SELECT t.token_mint_address AS mint, t.amount
      FROM tokens_solana.transfers t
      JOIN graduated_quote_vaults v ON v.vault = t.from_token_account
      WHERE t.outer_executing_account = '${LOCK_PROGRAM}'
        AND t.to_owner = '${PLATFORM_FEE_WALLET}'
        AND t.block_time >= from_unixtime(${options.startTimestamp})
        AND t.block_time <  from_unixtime(${options.endTimestamp})
    )
    -- Before graduation every trade against a vibes.fun bonding curve pays the 1% platform fee, charged in
    -- the pool's quote token (SOL, USDC or a tokenized stock).
    SELECT 'platform_fee' AS kind, l.quote_mint AS mint, CAST(SUM(t.platform_fee) AS VARCHAR) AS raw_amount
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
  for (const row of rows) {
    const amount = BigInt(row.raw_amount || 0);
    if (amount === 0n) continue;
    dailyFees.add(row.mint, amount, row.kind === "platform_fee" ? METRIC.TRADING_FEES : METRIC.LP_FEES);
  }

  const dailySupplySideRevenue = dailyFees.clone(HOLDERS_OF_COIN);
  const dailyProtocolRevenue = dailyFees.clone(TREASURY);
  const dailyHoldersRevenue = dailyFees.clone(VIBES_BUYBACK, METRIC.TOKEN_BUY_BACK);
  const dailyRevenue = dailyFees.clone(TREASURY + VIBES_BUYBACK);

  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailyHoldersRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Fees: "Trading fees collected by vibes.fun: the 1% platform fee on every trade against the Raydium LaunchLab bonding curves it configures, and, once a coin graduates, the quote-side trading fees of its permanently locked liquidity, harvested with the Fee Key vibes.fun holds. Raydium's own protocol fee is excluded. Amounts are in each pool's quote token.",
  UserFees: "Same as fees, paid by traders.",
  Revenue: "30% of fees: the share vibes.fun keeps, split between its treasury and $VIBES buyback and burn.",
  ProtocolRevenue: "15% of fees, sent to the vibes.fun treasury (Squads multisig).",
  HoldersRevenue: "15% of fees, used to buy back and burn $VIBES.",
  SupplySideRevenue: "70% of fees, paid to the holders of the coin that generated them, or to its creator when the creator chose creator fees.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.TRADING_FEES]: "1% of every LaunchLab bonding curve trade on a vibes.fun launch, charged in the pool's quote token.",
    [METRIC.LP_FEES]: "Quote-token fees harvested from the locked liquidity of graduated vibes.fun launches.",
  },
  Revenue: {
    [METRIC.TRADING_FEES]: "30% of bonding curve platform fees, kept by vibes.fun.",
    [METRIC.LP_FEES]: "30% of harvested locked liquidity fees, kept by vibes.fun.",
  },
  ProtocolRevenue: {
    [METRIC.TRADING_FEES]: "15% of bonding curve platform fees, sent to the treasury.",
    [METRIC.LP_FEES]: "15% of harvested locked liquidity fees, sent to the treasury.",
  },
  HoldersRevenue: {
    [METRIC.TOKEN_BUY_BACK]: "15% of fees spent buying $VIBES back and burning it.",
  },
  SupplySideRevenue: {
    [METRIC.TRADING_FEES]: "70% of bonding curve platform fees, paid to the holders of the coin that generated them or to its creator.",
    [METRIC.LP_FEES]: "70% of harvested locked liquidity fees, paid to the holders of the coin or to its creator.",
  },
};

const adapter: Adapter = {
  version: 1,
  dependencies: [Dependencies.DUNE],
  isExpensiveAdapter: true,
  doublecounted: true, // Raydium LaunchLab reports the same platform fees.
  methodology,
  breakdownMethodology,
  adapter: {
    [CHAIN.SOLANA]: { fetch, start: START },
  },
};

export default adapter;
