/*

Sanctum validator LSTs are LSTs deployed under the Sanctum stake pool programs (SP12tWFxD9oJsVWNavTTBZvMbA6gkAmxtVgxdqvyvhY or SPMBzsVUuoHA4Jm6KunbsotaahvVikZs1JyTW6iJvbn)
Total fees are the staking rewards (MEV + inflation) paid to all stake accounts from all Sanctum stake pools, paid to LST holders
Total revenue is fees (withdrawal fees + epoch fees) that are paid to each Sanctum LST's manager fee account, which are ATAs of EeQmNqm1RcQnee8LTyx6ccVG9FnR8TezQuw2JXq2LC1T (Sanctum wallet)

*/

import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";

const fetch: any = async (options: FetchOptions) => {
  const fees = await queryDuneSql(
    options,
    `
    with daily_fees as (SELECT 
    sum(lamports/1e9) as daily_fees
FROM solana.rewards rew
JOIN dune.sanctumso.result_sanctum_stake_pools_validator_stake_accounts vsa
    ON vsa.stake_account = rew.recipient
WHERE block_time >= from_unixtime(${options.startTimestamp})
AND block_time <= from_unixtime(${options.endTimestamp})
AND reward_type = 'Staking'), 
daily_revenue as (
SELECT
    sum(token_balance_change) as daily_revenue
FROM
    solana.account_activity aa
INNER JOIN solana.instruction_calls ic ON aa.tx_id = ic.tx_id
WHERE
 aa.block_time >= from_unixtime(${options.startTimestamp})
    AND aa.block_time <= from_unixtime(${options.endTimestamp})
    AND ic.executing_account IN (
        'SP12tWFxD9oJsVWNavTTBZvMbA6gkAmxtVgxdqvyvhY',
        'SPMBzsVUuoHA4Jm6KunbsotaahvVikZs1JyTW6iJvbn'
    )
    AND ic.tx_success = true
    and bytearray_substring (data, 1, 1) in (
        0x0a, -- 11 withdraw stake
        0x10, -- 17 withdraw sol
        0x18, -- 25 withdrawstakewithslippage
        0x1A, -- 27 withdrawsolwithslippage
        0x07 -- 8 updatestakepoolbalance
    )
and ic.tx_signer != 'GFHMc9BegxJXLdHJrABxNVoPRdnmVxXiNeoUCEpgXVHw'
AND aa.address in (
    select
        fee_account
    from
        dune.sanctumso.result_sanctum_lsts_manager_fee_accounts
)
)

select cast(df.daily_fees as BIGINT) as daily_fees, cast(daily_revenue as BIGINT) as daily_revenue from daily_revenue cross join daily_fees as df

`
  );

  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  dailyFees.addCGToken("solana", fees[0].daily_fees);
  dailyRevenue.addCGToken("solana", fees[0].daily_revenue);

  return { dailyFees, dailyRevenue: dailyRevenue };
};

const methodology = {
  Fees: "Staking rewards of all Sanctum LSTs",
  Revenue: "Epoch fees and withdrawal fees from Sanctum LSTs",
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.SOLANA]: {
      fetch: fetch,
      start: "2024-01-01", // First unstake transaction
      meta: {
        methodology,
      },
    },
  },
  isExpensiveAdapter: true,
};

export default adapter;
