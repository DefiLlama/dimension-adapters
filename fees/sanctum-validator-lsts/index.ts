/*

Sanctum validator LSTs are LSTs deployed under the Sanctum stake pool programs (SP12tWFxD9oJsVWNavTTBZvMbA6gkAmxtVgxdqvyvhY or SPMBzsVUuoHA4Jm6KunbsotaahvVikZs1JyTW6iJvbn)
Total fees are the staking rewards (MEV + inflation) paid to all stake accounts from all Sanctum stake pools then passed on to LST holders (LST/SOL goes up in value)
Total revenue used to be 0.1% of deposit fees
It is now is withdrawal fees (0.1%) + epoch fees (2.5% of staking rewards) that are paid to each Sanctum LST's manager fee account, which are ATAs of EeQmNqm1RcQnee8LTyx6ccVG9FnR8TezQuw2JXq2LC1T (Sanctum wallet)
See https://x.com/sanctumso/status/1898234985372328274 for more details

Here are the different materialized query you can find in the query below:
- dune.sanctumso.result_sanctum_validator_stake_accounts (https://dune.com/queries/5061762): list of stake accounts from sanctum stake pools
- dune.sanctumso.result_sanctum_lsts_manager_fee_accounts (https://dune.com/queries/4787643): list of manager fee accounts that stake pools fees get sent to from stake pools with an ATH stake of more than 1k SOL

*/

import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";
import { queryDuneSql } from "../../helpers/dune";

const fetch: any = async (_a: any, _b: any, options: FetchOptions) => {
  const fees = await queryDuneSql(
    options,
    `
    WITH stake_pool_instructions AS (
      SELECT
          tx_id,
          block_time,
          outer_instruction_index,
          CASE
            WHEN BYTEARRAY_SUBSTRING(data, 1, 1) IN (0x07, 0x09, 0x0e, 0x17, 0x19)
            THEN 'MintTo'
            ELSE 'Transfer'
          END AS spl_instruction_type,
          BYTEARRAY_SUBSTRING(data, 1, 1) AS instruction
        FROM solana.instruction_calls
        WHERE
          executing_account IN ('SP12tWFxD9oJsVWNavTTBZvMbA6gkAmxtVgxdqvyvhY', 'SPMBzsVUuoHA4Jm6KunbsotaahvVikZs1JyTW6iJvbn')
          AND BYTEARRAY_SUBSTRING(data, 1, 1) IN (0x0a /* withdraw stake */, 0x10 /* withdraw sol */, 0x18 /* withdrawstakewithslippage */, 0x1A /* withdrawsolwithslippage */, 0x09 /* 0x07, -- updatestakepoolbalance */
          /* deposit stake */, 0x0e /* deposit sol */, 0x17 /* deposit stake with slippage */, 0x19 /* deposit sol with slippage */)
          AND tx_success = TRUE
          AND block_time >= FROM_UNIXTIME(${options.startTimestamp})
          AND block_time <= FROM_UNIXTIME(${options.endTimestamp})
      ), transfer_txns AS (
        SELECT
          tx_id,
          outer_instruction_index,
          CASE
            WHEN BYTEARRAY_SUBSTRING(data, 1, 1) IN (0x07)
            THEN 'MintTo'
            ELSE 'Transfer'
          END AS spl_instruction_type,
          VARBINARY_TO_UINT256(VARBINARY_REVERSE(VARBINARY_SUBSTRING(data, 2, 8))) AS amount
        FROM solana.instruction_calls
        WHERE
          executing_account IN ('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA')
          AND BYTEARRAY_SUBSTRING(data, 1, 1) IN (0x0c, 0x03, 0x07)
          AND (
            BYTEARRAY_SUBSTRING(data, 1, 1) IN (0x0c, 0x03)
            AND ELEMENT_AT(account_arguments, 3) IN (
              SELECT
                fee_account
              FROM dune.sanctumso.result_sanctum_lsts_manager_fee_accounts
            )
            OR BYTEARRAY_SUBSTRING(data, 1, 1) IN (0x07)
            AND ELEMENT_AT(account_arguments, 2) IN (
              SELECT
                fee_account
              FROM dune.sanctumso.result_sanctum_lsts_manager_fee_accounts
            )
          )
          AND tx_success = TRUE
          AND block_time >= FROM_UNIXTIME(${options.startTimestamp})
          AND block_time <= FROM_UNIXTIME(${options.endTimestamp})
      ), daily_withdraw_and_deposit_fees AS (
        SELECT SUM(t.amount) / 1e9 AS daily_withdraw_and_deposit_fees
        FROM stake_pool_instructions s
        JOIN transfer_txns t USING (tx_id, outer_instruction_index, spl_instruction_type)
      ), epoch_fees_summary AS (
        SELECT
            SUM(rew.lamports) / 1e9 AS daily_fees,
            SUM(
                CASE
                    WHEN date_trunc('day', rew.block_time) > CAST('2025-03-14' AS TIMESTAMP)
                    THEN (rew.lamports / 1e9) * 0.025
                    ELSE 0
                END
            ) AS daily_revenue
        FROM solana.rewards AS rew
        JOIN dune.sanctumso.result_sanctum_validator_stake_accounts AS vsa
            ON vsa.stake_account = rew.recipient
        WHERE
            rew.reward_type = 'Staking'
            AND rew.block_time BETWEEN FROM_UNIXTIME(${options.startTimestamp}) AND FROM_UNIXTIME(${options.endTimestamp})
      )
      SELECT
        TRY_CAST(efs.daily_revenue AS DOUBLE) AS daily_epoch_revenue,
        TRY_CAST(efs.daily_fees AS DOUBLE) AS daily_epoch_fees,
        TRY_CAST(wddf.daily_withdraw_and_deposit_fees AS DOUBLE) AS daily_withdraw_and_deposit_fees
      FROM epoch_fees_summary AS efs, daily_withdraw_and_deposit_fees AS wddf
    `
  );

  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();

  dailyFees.addCGToken('solana', Number(fees[0].daily_epoch_fees), 'STAKING_REWARDS')
  dailyFees.addCGToken('solana', Number(fees[0].daily_withdraw_and_deposit_fees), METRIC.DEPOSIT_WITHDRAW_FEES)

  dailyRevenue.addCGToken('solana', Number(fees[0].daily_epoch_revenue), 'STAKING_REWARDS')
  dailyRevenue.addCGToken('solana', Number(fees[0].daily_withdraw_and_deposit_fees), METRIC.DEPOSIT_WITHDRAW_FEES)

  return {
    dailyFees,
    dailyRevenue: dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
  };
};

const methodology = {
  Fees: "Staking rewards + withdrawal/deposit fees from Sanctum LSTs",
  Revenue: "2.5% of staking rewards + withdrawal/deposit fees from Sanctum LSTs",
  ProtocolRevenue: "2.5% of staking rewards + withdrawal/deposit fees from Sanctum LSTs",
};

const breakdownMethodology = {
  Fees: {
    ['STAKING_REWARDS']: 'Validators staking rewards from Sanctum LSTS.',
    [METRIC.DEPOSIT_WITHDRAW_FEES]: 'SOL deposit and withdraw fees.',
  },
  Revenue: {
    ['STAKING_REWARDS']: '2.5% of validators staking rewards from Sanctum LSTS.',
    [METRIC.DEPOSIT_WITHDRAW_FEES]: 'All SOL deposit and withdraw fees.',
  },
  ProtocolRevenue: {
    ['STAKING_REWARDS']: '2.5% of validators staking rewards from Sanctum LSTS.',
    [METRIC.DEPOSIT_WITHDRAW_FEES]: 'All SOL deposit and withdraw fees.',
  },
}

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.SOLANA],
  dependencies: [Dependencies.DUNE],
  start: "2024-01-01", // First unstake transaction
  methodology,
  breakdownMethodology,
  isExpensiveAdapter: true,
};

export default adapter;
