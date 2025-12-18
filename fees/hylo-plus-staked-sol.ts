import { Dependencies, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getSqlFromFile, queryDuneSql } from "../helpers/dune";

const STAKE_POOL_RESERVE_ACCOUNT = "rp9wuHdLbzQzSDZmGXCwXbVNLWjuWBZCJZoXV6n6eJT";
const STAKE_POOL_WITHDRAW_AUTHORITY = "92rS1uTEmcATAjap6hW3M34jbNt67kK214PiSkbn25uK";
const LST_FEE_TOKEN_ACCOUNT = "GVraRwXx5UXJDHFUHyebBNySytkWdzUK7Z6QugbpZZEv";
const LST_MINT = 'hy1opf2bqRDwAxoktyWAj6f3UpeHcLydzEdKjMYGs2u';

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
  };
};

const methodology = {
  Fees: 'Staking rewards from staked SOL on Hylo+ staked solana',
  Revenue: 'Includes withdrawal fees and management fees collected by fee collector',
}

export default {
  version: 1,
  fetch,
  chains: [CHAIN.SOLANA],
  start: "2025-07-25",
  dependencies: [Dependencies.DUNE],
  isExpensiveAdapter: true,
  methodology,
};
