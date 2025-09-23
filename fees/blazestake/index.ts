import { FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getSqlFromFile, queryDuneSql } from "../../helpers/dune";
import ADDRESSES from "../../helpers/coreAssets.json";

const STAKE_POOL_RESERVE_ACCOUNT = "rsrxDvYUXjH1RQj2Ke36LNZEVqGztATxFkqNukERqFT";
const STAKE_POOL_WITHDRAW_AUTHORITY = "6WecYymEARvjG5ZyqkrVQ6YkhPfujNzWpSPwNKXHCbV2";
const LST_FEE_TOKEN_ACCOUNT = "Dpo148tVGewDPyh2FkGV18gouWctbdX2fHJopJGe9xv1";
const LST_MINT = ADDRESSES.solana.bSOL;

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
      dailyRevenue.addCGToken("blazestake-staked-sol", row.amount || 0);
    }
  });

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
  };
};

const methodology = {
  Fees: 'Staking rewards from staked SOL on blazestake',
  Revenue: 'Includes 0.1% instant withdrawal fee and 0.1% delayed withdrawal fee',
  ProtocolRevenue: 'All fees going to treasury/DAO (50% of total fees) + All fees going to the team(50% of total fees)'
}

export default {
  version: 1,
  methodology,
  fetch,
  chains: [CHAIN.SOLANA],
  start: "2022-12-07",
  isExpensiveAdapter: true
};
