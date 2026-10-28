import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import ADDRESSES from "../../helpers/coreAssets.json";
import { queryDuneSql } from "../../helpers/dune";

// CASH ($1 stablecoin SPL) mint used by tiny.place.
// Source: https://solscan.io/token/CASHx9KJUStyftLFWGvEVf59SGeG9sh5FfcnZMVPCASH
const CASH = "CASHx9KJUStyftLFWGvEVf59SGeG9sh5FfcnZMVPCASH";

// tiny.place Solana revenue/treasury wallet (publicly disclosed in the protocol's docs).
// Source: https://solscan.io/account/2mcvxY5LXKDUoUxArMMduGET1gevWEvr8c1NBoGxZENM
const REVENUE_WALLET = "2mcvxY5LXKDUoUxArMMduGET1gevWEvr8c1NBoGxZENM";

// SPL mint -> revenue-wallet token accounts (ATAs) that receive that mint.
// Each account is the associated token account owned by REVENUE_WALLET for the given mint:
//   USDC ATA: https://solscan.io/account/7ZuKVC1zWMmS8LG4wxXsZQSytZhUjUWRotR5bdXoxCQz
//   CASH ATA: https://solscan.io/account/695awLr41LCP7T3cGh6bmPdQ5YRrZ74d9XLAL244YLvN
// Native SOL has no token account; its inflows are counted separately from the wallet's
// lamport balance changes (see native_sol_inflows below), so its list is intentionally empty.
const REVENUE_TOKEN_ACCOUNTS = {
  [ADDRESSES.solana.USDC]: ["7ZuKVC1zWMmS8LG4wxXsZQSytZhUjUWRotR5bdXoxCQz"],
  [CASH]: ["695awLr41LCP7T3cGh6bmPdQ5YRrZ74d9XLAL244YLvN"],
  [ADDRESSES.solana.SOL]: [],
};

const LABELS = {
  PLATFORM_REVENUE: "Platform revenue wallet inflows",
};

const tokenAccountValues = Object.entries(REVENUE_TOKEN_ACCOUNTS)
  .flatMap(([mint, accounts]) => accounts.map((account) => `('${mint}', '${account}')`))
  .join(",\n        ");

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();

  const query = `
    WITH token_accounts(token, account) AS (
      VALUES
        ${tokenAccountValues}
    ),
    spl_inflows AS (
      SELECT
        ta.token,
        COALESCE(SUM(a.balance_change), 0) AS amount
      FROM solana.account_activity a
      JOIN token_accounts ta ON a.address = ta.account AND a.token_mint_address = ta.token
      WHERE a.tx_success = true
        AND a.balance_change > 0
        AND TIME_RANGE
      GROUP BY 1
    ),
    native_sol_inflows AS (
      SELECT
        '${ADDRESSES.solana.SOL}' AS token,
        COALESCE(SUM(a.balance_change), 0) AS amount
      FROM solana.account_activity a
      WHERE a.tx_success = true
        AND a.address = '${REVENUE_WALLET}'
        AND a.balance_change > 0
        AND a.token_mint_address IS NULL
        AND TIME_RANGE
      GROUP BY 1
    )
    SELECT * FROM spl_inflows
    UNION ALL
    SELECT * FROM native_sol_inflows
  `;

  const rows = await queryDuneSql(options, query);

  rows.forEach((row: { token: string; amount: number | string }) => {
    dailyFees.add(row.token, row.amount, LABELS.PLATFORM_REVENUE);
  });

  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
    // All inflows are retained by the protocol; no supply-side split.
    dailySupplySideRevenue: options.createBalances(),
  };
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.SOLANA],
  start: "2026-06-19",
  dependencies: [Dependencies.DUNE],
  isExpensiveAdapter: true,
  methodology: {
    Fees: "All supported asset inflows to the tinyplace revenue wallet on Solana.",
    Revenue: "All supported asset inflows to the tinyplace revenue wallet on Solana.",
    ProtocolRevenue: "All supported asset inflows to the tinyplace revenue wallet on Solana are retained as protocol revenue.",
  },
  breakdownMethodology: {
    Fees: {
      [LABELS.PLATFORM_REVENUE]: "USDC, CASH, and native SOL inflows to the tinyplace revenue wallet on Solana.",
    },
    Revenue: {
      [LABELS.PLATFORM_REVENUE]: "USDC, CASH, and native SOL inflows to the tinyplace revenue wallet on Solana.",
    },
    ProtocolRevenue: {
      [LABELS.PLATFORM_REVENUE]: "USDC, CASH, and native SOL inflows to the tinyplace revenue wallet on Solana.",
    },
  },
};

export default adapter;
