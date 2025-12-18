import { Dependencies, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getSqlFromFile, queryDuneSql } from "../helpers/dune";

const STAKE_POOL_RESERVE_ACCOUNT = "8Yz53yBLY5M8riwQ2qmJR3cQxiTmBvT9n1GDUJJTJo9";
const STAKE_POOL_WITHDRAW_AUTHORITY = "GiqwVAud4dH939qajy4F33Cht84kzutxJnGHez4urXnJ";
const LST_FEE_TOKEN_ACCOUNT = "EJFWuuqatTzwmL4oh4XrwtFHL4twbnAqSfdQRzkLxArT";
const LST_MINT = 'CDCSoLckzozyktpAp9FWT3w92KFJVEUxAU7cNu2Jn3aX';

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
  Fees: 'Staking rewards from staked SOL on Crypto.com staked solana',
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
