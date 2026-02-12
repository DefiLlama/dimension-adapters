import { Dependencies, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getSqlFromFile, queryDuneSql } from "../../helpers/dune";
import ADDRESSES from "../../helpers/coreAssets.json";
import { METRIC } from "../../helpers/metrics";

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
  const dailySupplySideRevenue = options.createBalances();

  results.forEach((row: any) => {
    if (row.metric_type === 'dailyFees') {
      dailyFees.addCGToken("solana", row.amount || 0, METRIC.STAKING_REWARDS);
      dailySupplySideRevenue.addCGToken("solana", row.amount || 0, METRIC.STAKING_REWARDS);
    } else if (row.metric_type === 'dailyRevenue') {
      dailyRevenue.addCGToken("bybit-staked-sol", row.amount || 0, METRIC.DEPOSIT_WITHDRAW_FEES);
      dailyFees.addCGToken("bybit-staked-sol", row.amount || 0, METRIC.DEPOSIT_WITHDRAW_FEES);
    }
  });

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue
  };
};

const methodology = {
  Fees: 'Staking rewards from staked SOL on bybit staked solana',
  Revenue: 'Includes withdrawal fees and management fees collected by fee collector',
  ProtocolRevenue: 'Revenue going to treasury/team',
  SupplySideRevenue: 'All the staking rewards go to stakers'
}

export default {
  version: 1,
  fetch,
  chains: [CHAIN.SOLANA],
  dependencies: [Dependencies.DUNE],
  start: "2024-09-07",
  methodology,
  isExpensiveAdapter: true,
  breakdownMethodology: {
    Fees: {
      [METRIC.STAKING_REWARDS]: 'Staking rewards from staked SOL on Bybit',
      [METRIC.DEPOSIT_WITHDRAW_FEES]: 'Includes a 0.1% deposit fee'
    },
    Revenue: {
      [METRIC.DEPOSIT_WITHDRAW_FEES]: 'Includes a 0.1% deposit fee'
    },
    ProtocolRevenue: {
      [METRIC.DEPOSIT_WITHDRAW_FEES]: 'Includes a 0.1% deposit fee'
    },
    SupplySideRevenue: {
      [METRIC.STAKING_REWARDS]: 'All the staking rewards are distributed to bbSOL'
    }
  },
};
