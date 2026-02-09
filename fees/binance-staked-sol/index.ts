import { Dependencies, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getSqlFromFile, queryDuneSql } from "../../helpers/dune";
import ADDRESSES from "../../helpers/coreAssets.json";
import { METRIC } from "../../helpers/metrics";

const STAKE_POOL_RESERVE_ACCOUNT = "9xcCvbbAAT9XSFsMAsCeR8CEbxutj15m5BfNr4DEMQKn";
const STAKE_POOL_WITHDRAW_AUTHORITY = "75NPzpxoh8sXGuSENFMREidq6FMzEx4g2AfcBEB6qjCV";
const LST_FEE_TOKEN_ACCOUNT = "3ZC6mkJr9hnFSrVHzXXcPopw3SArgKGm8agcah1vhy2Z";
const LST_MINT = ADDRESSES.solana.BNSOL;

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
      dailySupplySideRevenue.addCGToken("solana", row.amount * 0.9 || 0, METRIC.STAKING_REWARDS);
      dailyRevenue.addCGToken("solana", row.amount * 0.1 || 0, METRIC.STAKING_REWARDS);
    } else if (row.metric_type === 'dailyRevenue') {
      dailyRevenue.addCGToken("binance-staked-sol", row.amount || 0, METRIC.DEPOSIT_WITHDRAW_FEES);
      dailyFees.addCGToken("binance-staked-sol", row.amount || 0, METRIC.DEPOSIT_WITHDRAW_FEES);
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
  Fees: 'Staking rewards from staked SOL on binance staked solana',
  Revenue: 'Binance takes a 10% comission on the staking rewards',
  ProtocolRevenue: 'Revenue going to treasury/team',
  SupplySideRevenue: '90% of the staking rewards go to stakers'
}

export default {
  version: 1,
  fetch,
  chains: [CHAIN.SOLANA],
  dependencies: [Dependencies.DUNE],
  start: "2024-09-12",
  methodology,
  isExpensiveAdapter: true,
  breakdownMethodology: {
    Fees: {
      [METRIC.STAKING_REWARDS]: 'Staking rewards from staked SOL on Binance',
      [METRIC.DEPOSIT_WITHDRAW_FEES]: 'Includes withdrawal fees'
    },
    Revenue: {
      [METRIC.STAKING_REWARDS]: 'Binance takes a 10% performance fee on the staking rewards',
      [METRIC.DEPOSIT_WITHDRAW_FEES]: 'Includes withdrawal fees'
    },
    ProtocolRevenue: {
      [METRIC.STAKING_REWARDS]: 'Binance takes a 10% performance fee on the staking rewards',
      [METRIC.DEPOSIT_WITHDRAW_FEES]: 'Includes withdrawal fees'
    },
    SupplySideRevenue: {
      [METRIC.STAKING_REWARDS]: '90% of the staking rewards are distributed to bnSOL'
    }
  },
};