import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getSqlFromFile, queryDuneSql } from "../../helpers/dune";

const STAKE_POOL_RESERVE_ACCOUNT = "FFtERWBSCkScg8spA2mNB9zN5SdH16NqQywXw3bbB1aJ";
const STAKE_POOL_WITHDRAW_AUTHORITY = "4cpnpiwgBfUgELVwNYiecwGti45YHSH3R72CPkFTiwJt";
const LST_FEE_TOKEN_ACCOUNT = "GhN6PpyP6Ln4ycWcyvqsNcowLfYjpUcA9uWKAcFBjj2D";
const LST_MINT = "Gekfj7SL2fVpTDxJZmeC46cTYxinjB6gkAnb6EGT6mnn"

const fetch = async (_a: any, _b: any, options: FetchOptions) => {

  const query = getSqlFromFile("helpers/queries/sol-lst.sql", {
    start: options.startTimestamp,
    end: options.endTimestamp,
    stake_pool_reserve_account: STAKE_POOL_RESERVE_ACCOUNT,
    stake_pool_withdraw_authority: STAKE_POOL_WITHDRAW_AUTHORITY,
    lst_fee_token_account: LST_FEE_TOKEN_ACCOUNT,
    lst_mint: LST_MINT
  });

  const results = await queryDuneSql(options, query);

  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();

  results.forEach((row: any) => {
    if (row.metric_type === 'dailyFees') {
      dailyFees.addCGToken("solana", row.amount || 0);
    } else if (row.metric_type === 'dailyRevenue') {
      dailyRevenue.addCGToken("doublezero-staked-sol", row.amount || 0);
    }
  });

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue
  };
};

const methodology = {
  Fees: 'Staking rewards from staked SOL on doublezero staked solana',
  Revenue: 'Includes withdrawal fees and management fees collected by fee collector',
  ProtocolRevenue: 'Revenue going to treasury/team',
}

const adapter: SimpleAdapter = {
  version: 1,
  methodology,
  fetch,
  dependencies: [Dependencies.DUNE],
  chains: [CHAIN.SOLANA],
  start: "2025-07-25",
  isExpensiveAdapter: true
};

export default adapter;
