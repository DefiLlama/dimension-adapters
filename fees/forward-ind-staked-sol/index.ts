import { Dependencies, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getSqlFromFile, queryDuneSql } from "../../helpers/dune";

const STAKE_POOL_RESERVE_ACCOUNT = "FDjBN7LDysGEDvyy4hgh8sSP9ugVyGAS7spoYBkUnbTb";
const STAKE_POOL_WITHDRAW_AUTHORITY = "3ndMuPC9Cz5VC4RJkpoPaZz6Px6eVXtRenw9Yi1o2xnA";
const LST_FEE_TOKEN_ACCOUNT = "65Yk58ozpXDEgywHewvP1Z7KWhW4w7aSftwiDrsj48V8";
const LST_MINT = 'cPQPBN7WubB3zyQDpzTK2ormx1BMdAym9xkrYUJsctm';

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
  Fees: 'Staking rewards from staked SOL on forward industries staked solana',
  Revenue: 'Includes withdrawal fees and management fees collected by fee collector',
  ProtocolRevenue: 'Revenue going to treasury/team',
}

export default {
  version: 1,
  fetch,
  chains: [CHAIN.SOLANA],
  dependencies: [Dependencies.DUNE],
  start: "2025-11-11",
  methodology,
  isExpensiveAdapter: true
};