import { Dependencies, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getSqlFromFile, queryDuneSql } from "../../helpers/dune";

const STAKE_POOL_RESERVE_ACCOUNT = "edgekdZD5d1bd4WKBxVhYKik2RgH8cBrYCBVqmQzuNJ";
const STAKE_POOL_WITHDRAW_AUTHORITY = "FZEaZMmrRC3PDPFMzqooKLS2JjoyVkKNd2MkHjr7Xvyq";
const LST_FEE_TOKEN_ACCOUNT = "AJfw28SHAv5TiDXNUFLDKtmh8H7wkcjmeyc7ESbzsxRU";
const LST_MINT = 'edge86g9cVz87xcpKpy3J77vbp4wYd9idEV562CCntt';

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
      dailyRevenue.addCGToken("edgevana-staked-sol", row.amount || 0);
    }
  });
  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
  };
};

const methodology = {
  Fees: 'Staking rewards from staked SOL on Edgevana staked solana',
  Revenue: 'Includes withdrawal fees and management fees collected by fee collector.',
  ProtocolRevenue: 'Revenue going to treasury/team'
}

export default {
  version: 1,
  methodology,
  fetch,
  chains: [CHAIN.SOLANA],
  start: "2024-02-16",
  dependencies: [Dependencies.DUNE],
  isExpensiveAdapter: true
};