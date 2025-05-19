/*

Sanctum validator LSTs are LSTs deployed under the Sanctum stake pool programs (SP12tWFxD9oJsVWNavTTBZvMbA6gkAmxtVgxdqvyvhY or SPMBzsVUuoHA4Jm6KunbsotaahvVikZs1JyTW6iJvbn)
Total fees are the staking rewards (MEV + inflation) paid to all stake accounts from all Sanctum stake pools, paid to LST holders
Total revenue is withdrawal fees (0.1%) + epoch fees (variable but no less than 2.5%) that are paid to each Sanctum LST's manager fee account, which are ATAs of EeQmNqm1RcQnee8LTyx6ccVG9FnR8TezQuw2JXq2LC1T (Sanctum wallet)

Before the fee switch mid-March 2025, Sanctum stake pools were charging 0.1% deposit fees
See https://x.com/sanctumso/status/1898234985372328274 for more details

Here are the different materialized query you can find in the query below:
- dune.sanctumso.result_sanctum_validator_stake_accounts (https://dune.com/queries/5061762): list of stake accounts from sanctum stake pools
- dune.sanctumso.result_sanctum_lsts_manager_fee_accounts (https://dune.com/queries/4787643): list of manager fee accounts that stake pools fees get sent to from stake pools with an ATH stake of more than 1k SOL

*/

import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";

const fetch: any = async (_a: any, _b: any, options: FetchOptions) => {
  const fees = await queryDuneSql(
    options,
    `
    with daily_fees as (
      SELECT 
          COALESCE(sum(rew.lamports/1e9), 0) as daily_fees
      FROM solana.rewards rew
      JOIN dune.sanctumso.result_sanctum_validator_stake_accounts vsa
          ON vsa.stake_account = rew.recipient
      WHERE rew.block_time >= from_unixtime(${options.startTimestamp})
        AND rew.block_time <= from_unixtime(${options.endTimestamp})
        AND rew.reward_type = 'Staking'
    ),
    daily_revenue as (
      SELECT
          COALESCE(sum(aa.token_balance_change), 0) as daily_revenue
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
          AND bytearray_substring(ic.data, 1, 1) in (
              0x07, -- 7 update stake pool balance (mint epoch fees)
              0x09, -- 9 deposit stake
              0x0a, -- 10 withdraw stake
              0x0e, -- 14 deposit sol
              0x10, -- 16 withdraw sol
              0x17, -- 23 deposit stake with slippage
              0x18, -- 24 withdraw stake with slippage
              0x19, -- 25 deposit sol with slippage
              0x1A -- 26 withdraw sol with slippage
          )
          AND ic.tx_signer != 'GFHMc9BegxJXLdHJrABxNVoPRdnmVxXiNeoUCEpgXVHw'
          AND aa.address in (
              SELECT
                  fee_account
              FROM
                  dune.sanctumso.result_sanctum_lsts_manager_fee_accounts
          )
    )
    SELECT 
        CAST(df.daily_fees AS DOUBLE) AS daily_fees, 
        CAST(dr.daily_revenue AS DOUBLE) AS daily_revenue 
    FROM daily_fees df, daily_revenue dr
    `
  );

  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  dailyFees.addCGToken(
    "solana",
    Number(fees[0].daily_fees) + Number(fees[0].daily_revenue)
  );
  dailyRevenue.addCGToken("solana", fees[0].daily_revenue);

  return { dailyFees, dailyRevenue: dailyRevenue };
};

const methodology = {
  Fees: "Staking rewards of all Sanctum LSTs + Epoch and withdrawals fees",
  Revenue: "Epoch fees and withdrawals fees from Sanctum LSTs",
};

const adapter: SimpleAdapter = {
  version: 1,
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
