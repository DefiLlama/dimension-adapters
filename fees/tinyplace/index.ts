import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import ADDRESSES from "../../helpers/coreAssets.json";
import { queryDuneSql } from "../../helpers/dune";

const CASH = "CASHx9KJUStyftLFWGvEVf59SGeG9sh5FfcnZMVPCASH";

const REVENUE_WALLET = "2mcvxY5LXKDUoUxArMMduGET1gevWEvr8c1NBoGxZENM";

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
      [LABELS.PLATFORM_REVENUE]: "USDC, CASH, SOL, and WSOL inflows to the tinyplace revenue wallet on Solana.",
    },
    Revenue: {
      [LABELS.PLATFORM_REVENUE]: "USDC, CASH, SOL, and WSOL inflows to the tinyplace revenue wallet on Solana.",
    },
    ProtocolRevenue: {
      [LABELS.PLATFORM_REVENUE]: "USDC, CASH, SOL, and WSOL inflows to the tinyplace revenue wallet on Solana.",
    },
  },
};

export default adapter;
