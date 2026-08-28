import { Adapter, Dependencies, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryDuneSql } from "../helpers/dune";

// Raydium Burn & Earn. Every StonkFun launch locks its liquidity here.
const LOCK_PROGRAM = "LockrWmn6K5twhz3y9w1dQERbmgSaRkfnTeTKbpofwE";

// Creates the pools, holds the platform Fee Keys, signs the buybacks.
const OPERATOR = "5CEbueQnq1Ym2uSSx2xXds3jQAqT1BDnkA59RZobSPAG";

const STONK = "6GmAFSYs4gk3FDao5FzzySQpPZaWsa4rUJHacpMpUNgx";
const JUPITER = "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4";

type Row = { mint: string; raw_amount: string; kind: string };

// Each launch locks two positions and Raydium pays each one's fees to its Fee Key holder. The
// second key goes to the creator (50/50), a rewards wallet (15/85) or the flywheel (90/10)
// depending on launch type, so to_owner alone picks out the protocol's share of all three.
const fetch = async (options: FetchOptions) => {
  const rows = (await queryDuneSql(
    options,
    `
    WITH harvests AS (
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
    -- is revenue. A base mint comes from its one pool's vault; a quote asset is shared across many
    -- launches and so comes from several.
    quote_mints AS (
      SELECT mint FROM harvests GROUP BY mint HAVING COUNT(DISTINCT vault) > 1
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
    SELECT 'fee' AS kind, h.mint AS mint, CAST(SUM(h.amount) AS VARCHAR) AS raw_amount
    FROM harvests h JOIN quote_mints q ON q.mint = h.mint
    GROUP BY h.mint
    UNION ALL
    SELECT 'buyback' AS kind, b.mint AS mint, CAST(SUM(b.amount) AS VARCHAR) AS raw_amount
    FROM buybacks b JOIN quote_mints q ON q.mint = b.mint
    GROUP BY b.mint
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
  Fees: "StonkFun's share of trading fees from the locked Raydium CLMM positions behind each launch, read on-chain as the quote-token transfers Raydium's Burn & Earn program pays to the platform's operator wallet.",
  Revenue: "Same as fees (StonkFun's share of the locked Raydium CLMM positions behind each launch). Every dollar counted was harvested into the treasury.",
  HoldersRevenue:
    "Quote assets spent buying STONK on Jupiter, identified on-chain as swaps that returned STONK to the operator wallet. Measured at the amount spent, not the value of the tokens later burned.",
};

const breakdownMethodology = {
  Fees: {
    "Locked LP Trading Fees":
      "Quote-token fees harvested from the permanently locked launch positions.",
  },
  Revenue: {
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
