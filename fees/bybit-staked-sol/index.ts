import { FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getSqlFromFile, queryDuneSql } from "../../helpers/dune";
import ADDRESSES from "../../helpers/coreAssets.json";

const STAKE_POOL_RESERVE_ACCOUNT = "7huMsYqSXb1m4okiAJgQLPTamgHD2GvWhAou7vhzF51r";
const STAKE_POOL_WITHDRAW_AUTHORITY = "3pFTQjRVwcJHSpUNH5n1hx6Jwx7V3EzJDDHaKuwExyGJ";
const LST_FEE_TOKEN_ACCOUNT = "HcacehDEp8W4wSdy2oi4HgVoSWwMJDr1kZwXUBSuFfKK";
const LST_MINT = ADDRESSES.solana.bbSOL;

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
      dailyRevenue.addCGToken("bybit-staked-sol", row.amount || 0);
    }
  });

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue
  };
};

const meta = {
  methodology: {
    Fees: 'Staking rewards from staked SOL on bybit staked solana',
    Revenue: 'Includes withdrawal fees and management fees collected by fee collector',
    ProtocolRevenue: 'Revenue going to treasury/team',
  }
}

export default {
  version: 1,
  adapter: {
    [CHAIN.SOLANA]: {
      fetch,
      start: "2024-09-07",
      meta
    }
  },
  isExpensiveAdapter: true
};
