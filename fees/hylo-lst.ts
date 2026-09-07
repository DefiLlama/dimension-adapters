import { Dependencies, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getSqlFromFile, queryDuneSql } from "../helpers/dune";
import { METRIC } from "../helpers/metrics";

const STAKING_REWARDS_TO_STAKERS = 'Staking Rewards To Stakers';

const fetch = async (options: FetchOptions) => {
  const STAKE_POOL_RESERVE_ACCOUNT = "rz5G8P4tMbUS9NjwJbbbWMZqrCWEZGV3VmkNdNSn7s9";
  const STAKE_POOL_WITHDRAW_AUTHORITY = "2C9aTiNL6VyrPhFKspZC8BY9JeL3j4RtkPP2e4PrVAwP";
  const LST_FEE_TOKEN_ACCOUNT = "9mh4Y84YRaaT3EWdoEpkjZ2EVGycYmxvjuJ9krvGzAQx";
  const LST_MINT = 'hy1oXYgrBW6PVcJ4s6s2FKavRdwgWTXdfE69AxT7kPT';

  const query = getSqlFromFile("helpers/queries/sol-lst.sql", {
    start: options.startTimestamp,
    end: options.endTimestamp,
    stake_pool_reserve_account: STAKE_POOL_RESERVE_ACCOUNT,
    stake_pool_withdraw_authority: STAKE_POOL_WITHDRAW_AUTHORITY,
    lst_fee_token_account: LST_FEE_TOKEN_ACCOUNT,
    lst_mint: LST_MINT,
    exclude_mints_filter: ""
  });

  const results = await queryDuneSql(options, query);

  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const addPool = (rows: any[], lstMint: string) => {
    const amount = (metricType: string) =>
      Number(rows.find((row: any) => row.metric_type === metricType)?.amount) || 0;
    const stakingRewards = amount('dailyFees');
    const feeAccountInflows = amount('dailyRevenue');
    const userFees = amount('dailyUserFees');

    // The fee account takes user transfers and the minted epoch fee, nothing else.
    const mintedFee = feeAccountInflows - userFees;

    dailyFees.addCGToken("solana", stakingRewards, METRIC.STAKING_REWARDS);
    dailyFees.add(lstMint, userFees * 1e9, METRIC.DEPOSIT_WITHDRAW_FEES);
    dailyRevenue.add(lstMint, feeAccountInflows * 1e9, METRIC.MANAGEMENT_FEES);
    dailySupplySideRevenue.addCGToken("solana", stakingRewards, STAKING_REWARDS_TO_STAKERS);
    dailySupplySideRevenue.add(lstMint, -mintedFee * 1e9, STAKING_REWARDS_TO_STAKERS);
  };

  addPool(results, LST_MINT);

  const STAKE_POOL_RESERVE_ACCOUNT_PLUS = "rp9wuHdLbzQzSDZmGXCwXbVNLWjuWBZCJZoXV6n6eJT";
  const STAKE_POOL_WITHDRAW_AUTHORITY_PLUS = "92rS1uTEmcATAjap6hW3M34jbNt67kK214PiSkbn25uK";
  const LST_FEE_TOKEN_ACCOUNT_PLUS = "GVraRwXx5UXJDHFUHyebBNySytkWdzUK7Z6QugbpZZEv";
  const LST_MINT_PLUS = 'hy1opf2bqRDwAxoktyWAj6f3UpeHcLydzEdKjMYGs2u';

  const query_plus = getSqlFromFile("helpers/queries/sol-lst.sql", {
    start: options.startTimestamp,
    end: options.endTimestamp,
    stake_pool_reserve_account: STAKE_POOL_RESERVE_ACCOUNT_PLUS,
    stake_pool_withdraw_authority: STAKE_POOL_WITHDRAW_AUTHORITY_PLUS,
    lst_fee_token_account: LST_FEE_TOKEN_ACCOUNT_PLUS,
    lst_mint: LST_MINT_PLUS,
    exclude_mints_filter: ""
  });

  const results_plus = await queryDuneSql(options, query_plus);

  addPool(results_plus, LST_MINT_PLUS);

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Fees: 'Staking rewards from staked SOL on Hylo and Hylo+ staked solana, plus deposit/withdrawal fees paid by users',
  Revenue: 'Includes withdrawal fees and management fees collected by fee collector',
  ProtocolRevenue: 'Revenue going to treasury/team',
  SupplySideRevenue: 'Staking rewards distributed to LST stakers, net of the epoch fee',
}

const breakdownMethodology = {
  Fees: {
    [METRIC.STAKING_REWARDS]: 'Staking rewards earned on SOL staked through hyloSOL and hyloSOL+',
    [METRIC.DEPOSIT_WITHDRAW_FEES]: 'Deposit/withdrawal fees paid by users on their principal',
  },
  Revenue: {
    [METRIC.MANAGEMENT_FEES]: 'Withdrawal and management fees collected by the Hylo fee collector',
  },
  ProtocolRevenue: {
    [METRIC.MANAGEMENT_FEES]: 'Withdrawal and management fees going to the treasury/team',
  },
  SupplySideRevenue: {
    [STAKING_REWARDS_TO_STAKERS]: 'Staking rewards accruing to the LST stakers, less the epoch fee minted to the fee collector',
  },
}

export default {
  version: 1,
  fetch,
  chains: [CHAIN.SOLANA],
  start: "2025-07-25",
  dependencies: [Dependencies.DUNE],
  isExpensiveAdapter: true,
  methodology,
  breakdownMethodology,
};
