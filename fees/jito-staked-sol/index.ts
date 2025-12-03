import { Dependencies, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getSqlFromFile, queryDuneSql } from "../../helpers/dune";
import ADDRESSES from "../../helpers/coreAssets.json";

const STAKE_POOL_RESERVE_ACCOUNT = "BgKUXdS29YcHCFrPm5M8oLHiTzZaMDjsebggjoaQ6KFL";
const STAKE_POOL_WITHDRAW_AUTHORITY = "6iQKfEyhr3bZMotVkW6beNZz5CPAkiwvgV2CTje9pVSS";
const LST_FEE_TOKEN_ACCOUNT = "feeeFLLsam6xZJFc6UQFrHqkvVt4jfmVvi2BRLkUZ4i";
const LST_MINT = ADDRESSES.solana.JitoSOL;

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
      dailyRevenue.addCGToken("jito-staked-sol", row.amount || 0);
    }
  });

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailyHoldersRevenue: 0,
  };
};

const methodology = {
  Fees: 'Staking rewards from staked SOL on jito staked solana',
  Revenue: 'Includes withdrawal fees and management fees collected by fee collector.',
  ProtocolRevenue: 'Revenue going to treasury/team',
  HoldersRevenue: 'No revenue share to JTO token holders.',
}

export default {
  version: 1,
  methodology,
  fetch,
  chains: [CHAIN.SOLANA],
  start: "2024-04-08",
  dependencies: [Dependencies.DUNE],
  isExpensiveAdapter: true
};
