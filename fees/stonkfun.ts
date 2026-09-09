import { Adapter, Dependencies, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryDuneSql } from "../helpers/dune";

// Raydium Burn & Earn. Every StonkFun launch locks its liquidity here.
const LOCK_PROGRAM = "LockrWmn6K5twhz3y9w1dQERbmgSaRkfnTeTKbpofwE";

// Creates the pools, holds the platform Fee Keys, signs the buybacks.
const OPERATOR = "5CEbueQnq1Ym2uSSx2xXds3jQAqT1BDnkA59RZobSPAG";

const STONK = "6GmAFSYs4gk3FDao5FzzySQpPZaWsa4rUJHacpMpUNgx";

// Receives the platform fee of every StonkFun launch on Raydium LaunchLab. Other platform configs
// carry the StonkFun name in their metadata but pay themselves, so the wallet is the identity here.
// ponytail: a config that changes its fee wallet later would need update_platform_config too.
const PLATFORM_FEE_WALLET = "AvVCE7Ue49iZjYzkkHz6ZhVyvY6NLHw67vB8eQaffVPz";
const JUPITER = "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4";

// Raydium CPMM. LaunchLab graduations migrate into a CPMM config with the creator fee, and the
// operator is the pool creator, so it claims that fee with collect_creator_fee directly on this
// program. Those transfers never pass the lock program, which is why the harvest branch misses them.
const CPMM_PROGRAM = "CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C";

type Row = { mint: string; raw_amount: string; kind: string };

// Each launch locks two positions and Raydium pays each one's fees to its Fee Key holder. The
// second key goes to the creator (50/50), a rewards wallet (15/85) or the flywheel (90/10)
// depending on launch type, so to_owner alone picks out the protocol's share of all three.
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
    ),
    harvests AS (
      SELECT
        token_mint_address AS mint,
        from_token_account AS vault,
        amount
      FROM tokens_solana.transfers
      WHERE outer_executing_account = '${LOCK_PROGRAM}'
        AND to_owner = '${OPERATOR}'
        AND block_time >= from_unixtime(${options.startTimestamp})
        AND block_time <  from_unixtime(${options.endTimestamp})
    ),
    -- A harvest pays both sides of the pool and the base half gets burned, so only the quote side
    -- is revenue. Graduated LaunchLab pools are classified exactly: the migration call records which
    -- CPMM vault holds the quote and which the base.
    graduated_vaults AS (
      SELECT m.account_cpswap_quote_vault AS vault, 'quote' AS side
      FROM raydium_solana.raydium_launchpad_call_migrate_to_cpswap m
      JOIN stonkfun_configs c ON c.config = m.account_platform_config
      WHERE m.call_block_time >= DATE '2026-08-21'
      UNION ALL
      SELECT m.account_cpswap_base_vault, 'base'
      FROM raydium_solana.raydium_launchpad_call_migrate_to_cpswap m
      JOIN stonkfun_configs c ON c.config = m.account_platform_config
      WHERE m.call_block_time >= DATE '2026-08-21'
    ),
    -- Everything else (the CLMM positions behind pre-LaunchLab launches) is a quote if StonkFun has
    -- ever launched against it. Creators can pair against any token, so a custom quote used by a
    -- single launch arrives from a single vault; the old "more than one vault" test discarded those
    -- as base tokens and dropped about half of one day's revenue. The vault test is kept only as a
    -- fallback for quotes that never appeared on LaunchLab.
    quote_catalog AS (
      SELECT DISTINCT quote_mint AS mint FROM launchpad_pools
      UNION
      SELECT mint FROM harvests GROUP BY mint HAVING COUNT(DISTINCT vault) > 1
    ),
    harvest_quotes AS (
      SELECT h.mint, h.amount
      FROM harvests h
      LEFT JOIN graduated_vaults v ON v.vault = h.vault
      WHERE v.side = 'quote'
         OR (v.side IS NULL AND h.mint IN (SELECT mint FROM quote_catalog))
    ),
    -- Creator-fee claims on graduated pools: quote-side transfers out of a graduated pool's vault to
    -- the operator under the CPMM program. A claim only moves tokens in; a swap the operator ran
    -- against the same pool would also move tokens out, so those transactions are excluded.
    creator_fee_claims AS (
      SELECT t.token_mint_address AS mint, t.amount
      FROM tokens_solana.transfers t
      JOIN graduated_vaults v ON v.vault = t.from_token_account AND v.side = 'quote'
      WHERE t.outer_executing_account = '${CPMM_PROGRAM}'
        AND t.to_owner = '${OPERATOR}'
        AND t.block_time >= from_unixtime(${options.startTimestamp})
        AND t.block_time <  from_unixtime(${options.endTimestamp})
        AND t.tx_id NOT IN (
          SELECT tx_id
          FROM tokens_solana.transfers
          WHERE outer_executing_account = '${CPMM_PROGRAM}'
            AND from_owner = '${OPERATOR}'
            AND block_time >= from_unixtime(${options.startTimestamp})
            AND block_time <  from_unixtime(${options.endTimestamp})
        )
    ),
    stonk_received AS (
      SELECT DISTINCT tx_id
      FROM tokens_solana.transfers
      WHERE to_owner = '${OPERATOR}'
        AND token_mint_address = '${STONK}'
        AND block_time >= from_unixtime(${options.startTimestamp})
        AND block_time <  from_unixtime(${options.endTimestamp})
    ),
    -- Jupiter routes hops through the operator's own accounts, so one purchase shows up as three
    -- outgoing transfers at the same value. Only the first is the amount spent.
    buyback_legs AS (
      SELECT
        t.token_mint_address AS mint,
        t.amount,
        ROW_NUMBER() OVER (
          PARTITION BY t.tx_id
          ORDER BY t.outer_instruction_index, t.inner_instruction_index
        ) AS leg
      FROM tokens_solana.transfers t
      JOIN stonk_received s ON s.tx_id = t.tx_id
      WHERE t.from_owner = '${OPERATOR}'
        AND t.token_mint_address <> '${STONK}'
        AND t.outer_executing_account = '${JUPITER}'
        AND t.block_time >= from_unixtime(${options.startTimestamp})
        AND t.block_time <  from_unixtime(${options.endTimestamp})
    ),
    buybacks AS (
      SELECT mint, amount FROM buyback_legs WHERE leg = 1
    )
    SELECT 'fee' AS kind, mint, CAST(SUM(amount) AS VARCHAR) AS raw_amount
    FROM harvest_quotes
    GROUP BY mint
    UNION ALL
    SELECT 'creator_fee' AS kind, mint, CAST(SUM(amount) AS VARCHAR) AS raw_amount
    FROM creator_fee_claims
    GROUP BY mint
    UNION ALL
    SELECT 'buyback' AS kind, b.mint AS mint, CAST(SUM(b.amount) AS VARCHAR) AS raw_amount
    FROM buybacks b JOIN quote_catalog q ON q.mint = b.mint
    GROUP BY b.mint
    UNION ALL
    -- Launches start on a LaunchLab bonding curve, which charges StonkFun's 1% platform fee in the
    -- pool's quote token on every trade before the token graduates to the locked position above.
    SELECT 'platform_fee' AS kind, l.quote_mint AS mint, CAST(SUM(t.platform_fee) AS VARCHAR) AS raw_amount
    FROM raydium_solana.raydium_launchpad_evt_tradeevent t
    JOIN launchpad_pools l ON l.pool_state = t.pool_state
    WHERE t.evt_block_time >= from_unixtime(${options.startTimestamp})
      AND t.evt_block_time <  from_unixtime(${options.endTimestamp})
    GROUP BY l.quote_mint
  `
  )) as Row[];

  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();

  for (const row of rows) {
    const amount = BigInt(row.raw_amount || 0);
    if (amount === 0n) continue;
    if (row.kind === "buyback") {
      dailyHoldersRevenue.add(row.mint, amount, "STONK Buyback And Burn");
    } else if (row.kind === "platform_fee") {
      dailyFees.add(row.mint, amount, "Launch Curve Platform Fee");
      dailyRevenue.add(row.mint, amount, "Launch Curve Platform Fee");
    } else if (row.kind === "creator_fee") {
      dailyFees.add(row.mint, amount, "Graduated Pool Creator Fee");
      dailyRevenue.add(row.mint, amount, "Graduated Pool Creator Fee");
    } else {
      dailyFees.add(row.mint, amount, "Locked LP Trading Fees");
      dailyRevenue.add(row.mint, amount, "Locked LP Trading Fees");
    }
  }

  // No dailyProtocolRevenue. Buybacks are funded from income claimed on earlier days, so a
  // single-day revenue minus holders goes negative and any cap would be made up rather than read.
  return { dailyFees, dailyUserFees: dailyFees, dailyRevenue, dailyHoldersRevenue };
};

const methodology = {
  Fees: "StonkFun's share of trading fees only. Three sources: the 1% platform fee on every trade against the Raydium LaunchLab bonding curves it configures; the creator fee on every swap in the Raydium CPMM pools those launches graduate into, which StonkFun claims as pool creator; and its share of trading fees harvested from the permanently locked liquidity behind each launch. Raydium's protocol fee and third-party creator fees are excluded. All amounts are in each pool's quote token.",
  Revenue: "Same as fees. Platform fees accrue on the curve, creator fees and locked-position fees are claimed into the treasury.",
  HoldersRevenue:
    "Quote assets spent buying STONK on Jupiter, identified on-chain as swaps that returned STONK to the operator wallet. Measured at the amount spent, not the value of the tokens later burned.",
};

const breakdownMethodology = {
  Fees: {
    "Launch Curve Platform Fee":
      "1% of every LaunchLab bonding curve trade, charged in the pool's quote token and claimable by StonkFun's fee wallet.",
    "Graduated Pool Creator Fee":
      "Creator fee on swaps in the CPMM pools graduated launches migrate into, claimed by StonkFun as pool creator; quote side only.",
    "Locked LP Trading Fees":
      "Quote-token fees harvested from the permanently locked launch positions.",
  },
  Revenue: {
    "Launch Curve Platform Fee": "Platform fee accrued to StonkFun.",
    "Graduated Pool Creator Fee": "Creator fee claimed from graduated pools.",
    "Locked LP Trading Fees": "Quote-token fees retained by the protocol.",
  },
  HoldersRevenue: {
    "STONK Buyback And Burn": "Revenue spent buying the platform token back and burning it.",
  },
};

const adapter: Adapter = {
  version: 1,
  dependencies: [Dependencies.DUNE],
  isExpensiveAdapter: true,
  doublecounted: true, // Raydium reports the same CLMM swap fees.
  methodology,
  breakdownMethodology,
  adapter: {
    [CHAIN.SOLANA]: { fetch, start: "2026-07-25" },
  },
};

export default adapter;
