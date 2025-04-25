import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";

const fetch: any = async (options: FetchOptions) => {
  const fees = await queryDuneSql(
    options,
    `
        SELECT 
            sum(lamports/1e9) as daily_fees
        FROM solana.rewards rew
        JOIN dune.sanctumso.result_sanctum_stake_pools_validator_stake_accounts vsa
            ON vsa.stake_account = rew.recipient
        WHERE rew.block_time >= from_unixtime(${options.startTimestamp})
        AND rew.block_time <= from_unixtime(${options.endTimestamp})
        AND reward_type = 'Staking'
    `
  );

  const dailyFees = options.createBalances();
  dailyFees.addCGToken("solana", fees[0].daily_fees);

  return { dailyFees, dailyRevenue: dailyFees.clone(0.025) };
};

const methodology = {
  Fees: "Staking rewards",
  Revenue: "2.5% of staking rewards",
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
