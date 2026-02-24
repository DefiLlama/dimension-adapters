import {
  Dependencies,
  FetchOptions,
  SimpleAdapter,
} from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";

const FEE_WALLET = "9qX97Bd8dvHAknHVjCxz4uEJcPSE3NGjjgniMVdDBu6d";
const SOL_MINT = "So11111111111111111111111111111111111111112";

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const dailyFees = options.createBalances();

  // SOL fees: use account_activity to capture in-program SOL transfers
  // (system program transfers AND CPI-based deductions from program accounts)
  const solQuery = `
    SELECT SUM(balance_change) AS sol_amount
    FROM solana.account_activity
    WHERE address = '${FEE_WALLET}'
      AND balance_change > 0
      AND token_mint_address IS NULL
      AND TIME_RANGE
  `;
  const solResult = await queryDuneSql(options, solQuery);
  if (solResult?.[0]?.sol_amount) {
    dailyFees.add(SOL_MINT, solResult[0].sol_amount);
  }

  // SPL token fees: use token transfers table
  const splQuery = `
    SELECT token_mint_address AS mint, SUM(amount) AS amount
    FROM tokens_solana.transfers
    WHERE to_owner = '${FEE_WALLET}'
      AND token_mint_address != '${SOL_MINT}'
      AND TIME_RANGE
    GROUP BY token_mint_address
  `;
  const splResult = await queryDuneSql(options, splQuery, {
    extraUIDKey: "spl",
  });
  splResult?.forEach((row: any) => {
    dailyFees.add(row.mint, row.amount);
  });

  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  };
};

const methodology = {
  Fees: "All fees paid by users to use Mixoor. 0.15% SOL/SPL token on transfers",
  Revenue: "All fees are collected by Mixoor protocol.",
  ProtocolRevenue: "Transfer fees are collected by Mixoor protocol.",
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.SOLANA],
  dependencies: [Dependencies.DUNE],
  methodology,
  start: "2025-12-22",
  isExpensiveAdapter: true,
};

export default adapter;
