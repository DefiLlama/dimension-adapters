/*

Fees: There is a dynamic fee charged for utilisation of the Reserve Pool - based on the percentage of SOL left in the Reserve pool. This allows for low fees most of the time, and ensures efficient usage of SOL in times of great liquidity demand.
Source: https://learn.sanctum.so/docs/protocol/the-reserve/fees

For the Reserve and the Router, fees = revenue because there is no stakeholder other than Sanctum

*/

import {
  Dependencies,
  FetchOptions,
  SimpleAdapter,
} from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";

export const SanctumMetric = {
  InfinityStakingRewards: 'Infinity Staking Rewards',
  LstStakingRewards: 'LSTs Staking Rewards',
  DepositWithdrawFees: 'Deposit And Withdraw Fees',
  ReserveStakingRewards: 'Reserve Pool Staking Rewards',
  StakingRewardsToProtocol: 'Staking Rewards To Protocol',
  StakingRewardsToStakers: 'Staking Rewards To Stakers',
}

const fetch: any = async (_a: any, _b: any, options: FetchOptions) => {
  const fees = await queryDuneSql(
    options,
    `
        WITH router_and_reserve_transactions AS (
                SELECT
                    aa.balance_change / 1e9 AS daily_fees
                FROM
                    solana.account_activity aa
                    INNER JOIN sanctum_unstake_solana.unstake_call_unstake u ON aa.tx_id = u.call_tx_id
                WHERE
                    aa.address = 'EeQmNqm1RcQnee8LTyx6ccVG9FnR8TezQuw2JXq2LC1T'
                    AND aa.balance_change > 0
                    AND aa.tx_success = true
                    AND aa.block_time >= from_unixtime(${options.startTimestamp})
                    AND aa.block_time <= from_unixtime(${options.endTimestamp})
                UNION ALL
                SELECT
                    aa.balance_change / 1e9 AS daily_fees
                FROM
                    solana.account_activity aa
                    INNER JOIN sanctum_unstake_solana.unstake_call_unstakewsol u ON aa.tx_id = u.call_tx_id
                WHERE
                    aa.address = 'EeQmNqm1RcQnee8LTyx6ccVG9FnR8TezQuw2JXq2LC1T'
                    AND aa.balance_change > 0
                    AND aa.tx_success = true
                    AND aa.block_time >= from_unixtime(${options.startTimestamp})
                    AND aa.block_time <= from_unixtime(${options.endTimestamp})
                    AND u.call_tx_id not in (
                        select
                            call_tx_id
                        from
                            sanctum_unstake_solana.unstake_call_unstake
                        where
                            call_block_time >= from_unixtime(${options.startTimestamp})
                            AND call_block_time <= from_unixtime(${options.endTimestamp})
                    )
                UNION ALL 
                SELECT
                    COALESCE(token_balance_change, balance_change / 1e9) AS daily_fees -- handle case where it can be SOL
                FROM
                    solana.account_activity
                WHERE
                    address IN (
                        select
                            fee_account
                        from
                            dune.sanctumso.result_stakedex_fee_accounts
                    )
                    and token_balance_change > 0
                    AND block_time >= from_unixtime(${options.startTimestamp})
                    AND block_time <= from_unixtime(${options.endTimestamp})
                )
            
        SELECT
            SUM(daily_fees) AS daily_fees
        FROM
            router_and_reserve_transactions
    `
  );

  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  
  dailyFees.addCGToken("solana", fees[0].daily_fees, SanctumMetric.ReserveStakingRewards);
  dailyRevenue.addCGToken("solana", fees[0].daily_fees, SanctumMetric.StakingRewardsToProtocol);

  return { dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue };
};

const methodology = {
  Fees: "Reserve + Router fees",
  Revenue: "100% of Reserve + Router fees",
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.SOLANA],
  dependencies: [Dependencies.DUNE],
  start: "2022-07-22", // First unstake transaction
  methodology,
  isExpensiveAdapter: true,
  breakdownMethodology: {
    Fees: {
      [SanctumMetric.ReserveStakingRewards]: 'Reserve pool staking rewards.',
    },
    Revenue: {
      [SanctumMetric.ReserveStakingRewards]: 'Reserve pool staking rewards to Sanctum.',
    },
  }
};

export default adapter;
