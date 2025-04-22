import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryDuneSql } from "../helpers/dune";

const fetch: any = async (_a: any, _b: any, options: FetchOptions) => {
  const vol = await queryDuneSql(options, `
    WITH new_tokens_solana as (
      SELECT 
        tx_id,
        block_time,
        tx_signer
      FROM tokens_solana.transfers
      WHERE outer_executing_account = '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P'
      and TIME_RANGE
      GROUP BY 1,2,3
    ),

    buy_volume as (
    SELECT 
        SUM(lamports/1e9) as total_sol
    FROM system_program_solana.system_program_call_Transfer s
    INNER JOIN (SELECT tx_id,block_time FROM new_tokens_solana GROUP BY 1,2) n ON tx_id = call_tx_id and n.block_time = s.call_block_time
    WHERE TIME_RANGE
        and account_to != 'CebN5WGQ4jvEPvsVU4EoHEpgzq1VV7AbicfhtW4xC9iM'
    ),

    sell_volume as (
      SELECT 
        SUM(balance_change/1e9) as total_sol
        FROM solana.account_activity a
        INNER JOIN new_tokens_solana n 
            ON n.tx_id = a.tx_id and n.tx_signer = a.address and n.block_time = a.block_time
        WHERE a.block_time >= from_unixtime(${options.startTimestamp})
        AND a.block_time <= from_unixtime(${options.endTimestamp})
            and balance_change > 0
            and a.token_mint_address is null
    ),
    total_volume as (
    SELECT * FROM buy_volume
    UNION ALL
    SELECT * FROM sell_volume
    )

    SELECT
        SUM(total_sol) as total_sol_volume
    FROM total_volume
  `);

  const dailyVolume = options.createBalances()
  dailyVolume.add('So11111111111111111111111111111111111111112', vol[0].total_sol_volume*1e9);
  return { dailyVolume }
}

const adapter: SimpleAdapter = {
  version: 1,
  adapter: {
    [CHAIN.SOLANA]: {
      fetch: fetch,
      start: '2024-03-01'
    },
  },
  isExpensiveAdapter: true
};

export default adapter;