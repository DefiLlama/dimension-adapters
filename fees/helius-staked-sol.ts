import { Dependencies, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getSqlFromFile, queryDuneSql } from "../helpers/dune";

const STAKE_POOL_RESERVE_ACCOUNT = "xdmLgScxrbbUu2gx7j2iqQXVKZYBCTDiCtR7AsHHJYQ";
const STAKE_POOL_WITHDRAW_AUTHORITY = "2rMuGTyXCqCHZBSu6NZR9Aq8MhZX9gLkCHoQsPhSj2YF";
const LST_FEE_TOKEN_ACCOUNT = "C1mXWyT6CpiatsC2ob4tTTdT6nHJBVmcPzrV5oAXXDT5";
const LST_MINT = 'he1iusmfkpAdwvxLNGV8Y1iSbj4rUy6yMhEA3fotn9A';

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
      dailyRevenue.add(LST_MINT, Number(row.amount) * 1e9 || 0);
    }
  });

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue
  };
};

const methodology = {
  Fees: 'Staking rewards from staked SOL on Helius staked solana',
  Revenue: 'Includes withdrawal fees and management fees collected by fee collector',
  ProtocolRevenue: 'Revenue going to treasury/team',
}

export default {
  version: 1,
  fetch,
  chains: [CHAIN.SOLANA],
  start: "2024-07-17",
  dependencies: [Dependencies.DUNE],
  isExpensiveAdapter: true,
  methodology,
};
