import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getSqlFromFile, queryDuneSql } from "../../helpers/dune";
import ADDRESSES from "../../helpers/coreAssets.json";

const STAKE_POOL_RESERVE_ACCOUNT = "FMAWbzuxsgbgndArunedwxXPA6sweaVUGGgadCpSxau2";
const STAKE_POOL_WITHDRAW_AUTHORITY = "EMjuABxELpYWYEwjkKmQKBNCwdaFAy4QYAs6W9bDQDNw";
// const LST_FEE_TOKEN_ACCOUNT = "DG399HKiLgKxGG176QiojyTtiSeqAurK6FVXGfBPTzSD"; // old
const LST_FEE_TOKEN_ACCOUNT = "GbvFCpMqKX65gQ8KNeob9JUAL7vHCHFSg8YN5bnpPT8g";
const LST_MINT = ADDRESSES.solana.JupSOL;

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
      dailyRevenue.addCGToken("jupiter-staked-sol", row.amount || 0);
    }
  });

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue
  };
};

const methodology = {
  Fees: 'Staking rewards from staked SOL on jupiter staked solana',
  Revenue: 'Includes withdrawal fees and management fees collected by fee collector',
  ProtocolRevenue: 'Revenue going to treasury/team',
}

const adapter: SimpleAdapter = {
  version: 1,
  methodology,
  fetch,
  dependencies: [Dependencies.DUNE],
  chains: [CHAIN.SOLANA],
  start: "2024-06-09",
  isExpensiveAdapter: true
};

export default adapter;