// Documentation for Sanctum Reserve
//
// Fees: There is a dynamic fee charged for utilisation of the Reserve Pool - based on the percentage of SOL left in the Reserve pool. This allows for low fees most of the time, and ensures efficient usage of SOL in times of great liquidity demand.
// Source: https://learn.sanctum.so/docs/protocol/the-reserve/fees
//
// Are deposits open for The Reserve?: Public deposits are not open for The Reserve. Depositors will need to deposit SOL for a long time frame, and cannot remove their SOL at any given time. Returns rely on periods of demand for SOL, which fluctuate and cannot be predicted.
// Source: https://learn.sanctum.so/docs/protocol/the-reserve/are-deposits-open-for-the-reserve
//
// What does the Reserve do?: Sanctum Reserve Pool provides deep liquidity for all liquid staking tokens on Solana. It accepts staked SOL and gives SOL in return, unstaking the staked SOL at the end of the epoch to replenish its reserves.
// Source: https://learn.sanctum.so/docs/protocol/the-reserve/what-does-the-reserve-do
//
// When do I use the Reserve Pool?: You can unstake a stake account instantly to receive SOL. If the validator your stake account is staked to does not have its own LST, you can still unstake to receive SOL instantly.
// Source: https://learn.sanctum.so/docs/protocol/the-reserve/when-do-i-use-the-reserve-pool


import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";

const fetch: any = async (options: FetchOptions) => {
  const fees = await queryDuneSql(options, `
    WITH unstake_transactions AS (
            SELECT
                aa.block_time,
                aa.tx_id,
                aa.balance_change / 1e9 AS fees
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
                aa.block_time,
                aa.tx_id,
                aa.balance_change / 1e9 AS unstake_fees
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
        )
    SELECT
        SUM(fees) AS daily_fees
    FROM
        unstake_transactions
    `)
  const dailyFees = options.createBalances()
  dailyFees.addCGToken('solana', fees[0].daily_fees);
  return { dailyFees, dailyRevenue: dailyFees }
}

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.SOLANA]: {
      fetch: fetch,
      start: '2022-07-22'  // First unstake transaction
    },
  },
  isExpensiveAdapter: true
};

export default adapter;