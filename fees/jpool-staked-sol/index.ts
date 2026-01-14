import { Dependencies, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getSqlFromFile, queryDuneSql } from "../../helpers/dune";

const STAKE_POOL_RESERVE_ACCOUNT = "AXu3DTw9AFq9FDTzX4vqA3XiT7LjrS5DpbsZaPpEx6qR";
const STAKE_POOL_WITHDRAW_AUTHORITY = "HbJTxftxnXgpePCshA8FubsRj9MW4kfPscfuUfn44fnt";
const LST_FEE_TOKEN_ACCOUNT = "GLysLmE2bwaTNCioDoadMvt9A4RvdFokE4BZwuFoeSn4";
const LST_MINT = '7Q2afV64in6N6SeZsAAB81TJzwDoD6zpqmHkzi9Dcavn';

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
      dailyRevenue.addCGToken("jpool", row.amount || 0);
    }
  });
  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
  };
};

const methodology = {
  Fees: 'Staking rewards from staked SOL on jpool staked solana',
  Revenue: 'Includes withdrawal fees and management fees collected by fee collector.',
  ProtocolRevenue: 'Revenue going to treasury/team'
}

export default {
  version: 1,
  methodology,
  fetch,
  chains: [CHAIN.SOLANA],
  start: "2022-09-05",
  dependencies: [Dependencies.DUNE],
  isExpensiveAdapter: true
};