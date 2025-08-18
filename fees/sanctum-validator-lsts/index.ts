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
      ), stake_pool_transactions AS (
        SELECT
          block_time,
          tx_id,
          amount
        FROM stake_pool_instructions
        INNER JOIN transfer_txns
          USING (tx_id, outer_instruction_index, spl_instruction_type)
      ), withdraw_and_deposit_daily_fees AS (
        SELECT
          SUM(COALESCE(amount, 0) / 1e9) AS withdraw_and_deposit_daily_fees
        FROM stake_pool_transactions AS spt
      ), epoch_fees AS (
        SELECT
          COALESCE(SUM(rew.lamports / 1e9), 0) AS daily_fees
        FROM solana.rewards AS rew
        JOIN dune.sanctumso.result_sanctum_validator_stake_accounts AS vsa
          ON vsa.stake_account = rew.recipient
        WHERE
          rew.block_time >= FROM_UNIXTIME(${options.startTimestamp})
          AND rew.block_time <= FROM_UNIXTIME(${options.endTimestamp})
          AND rew.block_time > CAST('2025-03-14' AS TIMESTAMP)
          AND rew.reward_type = 'Staking'
      )
      SELECT
        TRY_CAST(df.daily_fees AS DOUBLE) AS daily_fees,
        TRY_CAST(wddf.withdraw_and_deposit_daily_fees AS DOUBLE) AS withdraw_and_deposit_daily_fees
      FROM epoch_fees AS df, withdraw_and_deposit_daily_fees AS wddf
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
    },
  },
  methodology,
  isExpensiveAdapter: true,
};

export default adapter;
