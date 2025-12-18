import { Dependencies, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getSqlFromFile, queryDuneSql } from "../helpers/dune";

const STAKE_POOL_RESERVE_ACCOUNT = "FL2AsvZPTW33QdmBgQx15ZdtaSbmuwY3oBCJMj63u9W1";
const STAKE_POOL_WITHDRAW_AUTHORITY = "9yWcz4S27nXKpsVmWqaimphCUnFo441JUvwkzmvRWys3";
const LST_FEE_TOKEN_ACCOUNT = "5VyLWq6nGg8mkAsHUwn6KqnaTni6hFZHb6dGiV7dCtGz";
const LST_MINT = 'SAVEDpx3nFNdzG3ymJfShYnrBuYy7LtQEABZQ3qtTFt';

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
  Fees: 'Staking rewards from staked SOL on save staked solana',
  Revenue: 'Includes withdrawal fees and management fees collected by fee collector',
  ProtocolRevenue: 'Revenue going to treasury/team',
}

export default {
  version: 1,
  fetch,
  chains: [CHAIN.SOLANA],
  start: "2025-03-31",
  dependencies: [Dependencies.DUNE],
  isExpensiveAdapter: true,
  methodology,
};
