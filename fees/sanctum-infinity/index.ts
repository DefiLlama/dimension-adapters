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
