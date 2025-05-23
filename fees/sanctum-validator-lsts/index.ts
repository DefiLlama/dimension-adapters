/*

Sanctum validator LSTs are LSTs deployed under the Sanctum stake pool programs (SP12tWFxD9oJsVWNavTTBZvMbA6gkAmxtVgxdqvyvhY or SPMBzsVUuoHA4Jm6KunbsotaahvVikZs1JyTW6iJvbn)
Total fees are the staking rewards (MEV + inflation) paid to all stake accounts from all Sanctum stake pools, paid to LST holders
Total revenue is withdrawal fees (0.1%) + epoch fees (2.5% of staking rewards) that are paid to each Sanctum LST's manager fee account, which are ATAs of EeQmNqm1RcQnee8LTyx6ccVG9FnR8TezQuw2JXq2LC1T (Sanctum wallet)

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
    WITH
    stake_pool_instructions AS (
        select 
            tx_id, 
            block_time,
            outer_instruction_index,
            case 
                when bytearray_substring (data, 1, 1) in (0x07,0x09,0x0e,0x17,0x19) then 'MintTo' 
            else 'Transfer' end as spl_instruction_type,
            bytearray_substring (data, 1, 1) as instruction
    from solana.instruction_calls
        where 
            executing_account IN (
                'SP12tWFxD9oJsVWNavTTBZvMbA6gkAmxtVgxdqvyvhY',
                'SPMBzsVUuoHA4Jm6KunbsotaahvVikZs1JyTW6iJvbn'
            )
            and bytearray_substring (data, 1, 1) in (
                0x0a, -- withdraw stake
                0x10, -- withdraw sol
                0x18, -- withdrawstakewithslippage
                0x1A, -- withdrawsolwithslippage 
                --0x07, -- updatestakepoolbalance
                0x09, -- deposit stake
                0x0e, -- deposit sol
                0x17,-- deposit stake with slippage
                0x19 -- deposit sol with slippage
            )
            and tx_success = true
            AND block_time >= from_unixtime(${options.startTimestamp})
            AND block_time <= from_unixtime(${options.endTimestamp})
    ),
    transfer_txns as (
        SELECT 
            tx_id, 
            outer_instruction_index,
            case when bytearray_substring (data, 1, 1) in (0x07) then 'MintTo' else 'Transfer' end as spl_instruction_type,
            varbinary_to_uint256(varbinary_reverse(varbinary_substring(data, 2, 8))) as amount
        from solana.instruction_calls
        where 
            executing_account IN (
                'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'
            )
            and bytearray_substring (data, 1, 1) in (0x0c,0x03,0x07)
            and (
                bytearray_substring (data, 1, 1) in (0x0c,0x03) and element_at(account_arguments, 3) in (select fee_account from dune.sanctumso.result_sanctum_lsts_manager_fee_accounts)
                OR bytearray_substring (data, 1, 1) in (0x07) and element_at(account_arguments, 2) in (select fee_account from dune.sanctumso.result_sanctum_lsts_manager_fee_accounts)
            )
            and tx_success = true
            AND block_time >= from_unixtime(${options.startTimestamp})
            AND block_time <= from_unixtime(${options.endTimestamp})
    ),
    stake_pool_transactions AS (
        select 
            block_time,
            tx_id, 
            amount
        from stake_pool_instructions inner join transfer_txns using (tx_id, outer_instruction_index, spl_instruction_type)
    ),
    withdraw_and_deposit_daily_fees AS (
        SELECT
            sum(COALESCE(amount, 0) / 1e9) as withdraw_and_deposit_daily_fees
        FROM
            stake_pool_transactions spt
    ),
    epoch_fees as (
        SELECT 
          COALESCE(sum(rew.lamports/1e9), 0) as daily_fees
      FROM solana.rewards rew
      JOIN dune.sanctumso.result_sanctum_validator_stake_accounts vsa
      
          ON vsa.stake_account = rew.recipient
      WHERE rew.block_time >= from_unixtime(${options.startTimestamp})
        AND rew.block_time <= from_unixtime(${options.endTimestamp})
        AND rew.reward_type = 'Staking'
    )
    SELECT 
        CAST(df.daily_fees AS DOUBLE) AS daily_fees, 
        CAST(wddf.withdraw_and_deposit_daily_fees AS DOUBLE) AS withdraw_and_deposit_daily_fees
    FROM epoch_fees df, withdraw_and_deposit_daily_fees wddf
    `
  );

  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  dailyFees.addCGToken(
    "solana",
    Number(fees[0].daily_fees) + Number(fees[0].withdraw_and_deposit_daily_fees)
  );
  dailyRevenue.addCGToken(
    "solana",
    Number(0.025 * fees[0].daily_fees) +
      Number(fees[0].withdraw_and_deposit_daily_fees)
  );

  return {
    dailyFees,
    dailyRevenue: dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
  };
};

const methodology = {
  Fees: "Staking rewards + withdrawal/deposit fees from Sanctum LSTs",
  Revenue:
    "2.5% of staking rewards + withdrawal/deposit fees from Sanctum LSTs",
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
