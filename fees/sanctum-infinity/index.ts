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
  const fees = await queryDuneSql(
    options,
    `
        SELECT
            cast(sum(token_balance_change) * 10 as BIGINT) as daily_fees
        FROM
            solana.account_activity
        WHERE
            address IN (
                select
                    fee_account
                from
                    dune.sanctumso.result_infinity_fee_accounts
            )
            AND block_time >= from_unixtime(${options.startTimestamp})
            AND block_time <= from_unixtime(${options.endTimestamp})
    `
  );

  const dailyFees = options.createBalances();
  dailyFees.addCGToken("solana", fees[0].daily_fees);

  return { dailyFees, dailyRevenue: dailyFees.clone(0.1) };
};

const methodology = {
  Fees: "Trading fees",
  Revenue: "10% of trading fees",
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
