import {
  Dependencies,
  FetchOptions,
  SimpleAdapter,
} from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";

const FEE_WALLET = "9qX97Bd8dvHAknHVjCxz4uEJcPSE3NGjjgniMVdDBu6d";

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const query = `
  SELECT
    'So11111111111111111111111111111111111111112' AS token,
    COALESCE(SUM(balance_change), 0) AS total_fees
  FROM solana.account_activity
  WHERE address = '${FEE_WALLET}'
    AND balance_change > 0
    AND token_mint_address IS NULL
    AND TIME_RANGE

  UNION ALL

  SELECT
    token_mint_address AS token,
    COALESCE(SUM(amount), 0) AS total_fees
  FROM tokens_solana.transfers
  WHERE to_owner = '${FEE_WALLET}'
    AND from_owner != '${FEE_WALLET}'
    AND TIME_RANGE
  GROUP BY token_mint_address
`;
  const result = await queryDuneSql(options, query);
  const dailyFees = options.createBalances();

  result.forEach((row: any) => {
    dailyFees.add(row.token, row.total_fees);
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
