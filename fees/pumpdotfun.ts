import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryDuneSql } from "../helpers/dune";

const fetch: any = async (_a: any, _b: any, options: FetchOptions) => {
  const dailyFees = options.createBalances();

  // https://dune.com/queries/4313339
  const value = (await queryDuneSql(options, 
    `WITH new_tokens_solana as (
          SELECT 
            tx_id,
            from_owner
          FROM tokens_solana.transfers
          WHERE outer_executing_account = '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P'
          and block_time >= from_unixtime(${options.startTimestamp})
          AND block_time <= from_unixtime(${options.endTimestamp})
          GROUP BY 1,2
      ),

      fees as (
        SELECT 
          a.tx_id,
          a.block_time,
          a.address as tx_signer,
          'Sell' as action_type,
          balance_change/1e9 as total_sol
          FROM solana.account_activity a
          LEFT JOIN new_tokens_solana n 
              ON n.tx_id = a.tx_id 
          WHERE DATE(a.block_time) > DATE('2024-03-01')
              and balance_change > 0
              and a.token_mint_address is null
              and a.address in (
                'CebN5WGQ4jvEPvsVU4EoHEpgzq1VV7AbicfhtW4xC9iM',
                '62qc2CNXwrYqQScmEdiZFFAnJR262PxWEuNQtxfafNgV',
                '7hTckgnGnLQR6sdH7YkqFTAA7VwTfYFaZ6EhEsU3saCX'
              )
              and n.from_owner not in (
                '39azUYFWPz3VHgKCf3VChUwbpURdCHRxjWVowf5jUJjg',
                '12xs3VnsaoEduxobnbaxQtCh6PQMDoFUrP4YB1F8pFPX'
              )
              and block_time >= from_unixtime(${options.startTimestamp})
              and block_time <= from_unixtime(${options.endTimestamp})
      )


      SELECT
          SUM(total_sol) as total_sol_revenue
      FROM fees
      where block_time >= from_unixtime(${options.startTimestamp})
      and block_time <= from_unixtime(${options.endTimestamp})
    `)
  );
  dailyFees.add('So11111111111111111111111111111111111111112', value[0].total_sol_revenue * 1e9);

  return { dailyFees, dailyRevenue: dailyFees }

}

const adapter: SimpleAdapter = {
  version: 1,
  adapter: {
    [CHAIN.SOLANA]: {
      fetch: fetch,
    },
  },
  isExpensiveAdapter: true
};

export default adapter;
