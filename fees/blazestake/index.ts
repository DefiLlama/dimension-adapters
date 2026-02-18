import { Dependencies, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getSqlFromFile, queryDuneSql } from "../../helpers/dune";
import ADDRESSES from "../../helpers/coreAssets.json";
import { METRIC } from "../../helpers/metrics"

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
  const dailySupplySideRevenue = options.createBalances()

  results.forEach((row: any) => {
    if (row.metric_type === 'dailyFees') {
      dailyFees.addCGToken("solana", row.amount || 0, METRIC.STAKING_REWARDS);
      dailySupplySideRevenue.addCGToken("solana", row.amount || 0, METRIC.STAKING_REWARDS);
    } else if (row.metric_type === 'dailyRevenue') {
      dailyRevenue.addCGToken("blazestake-staked-sol", row.amount || 0, METRIC.DEPOSIT_WITHDRAW_FEES);
      dailyFees.addCGToken("blazestake-staked-sol", row.amount || 0, METRIC.DEPOSIT_WITHDRAW_FEES);
    }
  });

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
    dailyHoldersRevenue: 0,
  };
};

const methodology = {
  Fees: 'Staking rewards from staked SOL on blazestake',
  Revenue: 'Includes 0.1% instant withdrawal fee and 0.1% delayed withdrawal fee',
  SupplySideRevenue: 'All the staking rewards are distributed to bSOL',
  ProtocolRevenue: 'All fees going to treasury/DAO (50% of total fees) + All fees going to the team(50% of total fees)',
  HoldersRevenue: 'No revenue share to BLZE token holders',
}

export default {
  version: 1,
  fetch,
  chains: [CHAIN.SOLANA],
  dependencies: [Dependencies.DUNE],
  start: "2022-12-07",
  methodology,
  breakdownMethodology: {
    Fees: {
      [METRIC.STAKING_REWARDS]: 'Staking rewards from staked SOL on Blazestake',
      [METRIC.DEPOSIT_WITHDRAW_FEES]: 'Includes 0.1% instant withdrawal fee and 0.1% delayed withdrawal fee'
    },
    Revenue: {
      [METRIC.DEPOSIT_WITHDRAW_FEES]: 'Includes 0.1% instant withdrawal fee and 0.1% delayed withdrawal fee'
    },
    ProtocolRevenue: {
      [METRIC.DEPOSIT_WITHDRAW_FEES]: 'Includes 0.1% instant withdrawal fee and 0.1% delayed withdrawal fee'
    },
    SupplySideRevenue: {
      [METRIC.STAKING_REWARDS]: 'All the staking rewards are distributed to bSOL'
    }
  } ,
  isExpensiveAdapter: true
};
