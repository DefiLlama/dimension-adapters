/*

The Sanctum Infinity program is indexed on Dune.
One can get the SOL value for a swap by retrieving the flat fee pricing program's PriceExactIn instruction associated
Example transaction: https://solscan.io/tx/5HrEhUHHfeNktcQbRWcAEWemd3K475bxUqKJenqyoaKQZUuz5D9xuX1A4Bp8gms2mgYk4pbzKQC7yNtJAWJvXZPg  

*/

import {
  ChainBlocks,
  Dependencies,
  FetchOptions,
  FetchResultVolume,
  SimpleAdapter,
} from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";

const fetch = async (
  timestamp: number,
  _: ChainBlocks,
  options: FetchOptions
): Promise<FetchResultVolume> => {
  const volume = // https://dune.com/queries/4789107/7941663
    (
      await queryDuneSql(
        options,
        `
        WITH
        infinity_txns AS (
            SELECT
                call_tx_id,
                call_block_time,
                account_src_lst_mint AS src_mint,
                account_dst_lst_mint AS dest_mint,
                'SwapExactIn' AS event
            FROM
                sanctum_infinity_solana.s_controller_call_SwapExactIn
            WHERE
                call_block_time >= from_unixtime(${options.startTimestamp})
                AND call_block_time <= from_unixtime(${options.endTimestamp})
                AND account_dst_lst_mint != 'Stake11111111111111111111111111111111111111111'
            UNION
            SELECT
                call_tx_id,
                call_block_time,
                account_src_lst_mint AS src_mint,
                account_dst_lst_mint AS dest_mint,
                'SwapExactOut' AS event
            FROM
                sanctum_infinity_solana.s_controller_call_SwapExactOut
            WHERE
                call_block_time >= from_unixtime(${options.startTimestamp})
                AND call_block_time <= from_unixtime(${options.endTimestamp})
        ),
        flt_calls AS (
            SELECT
                tx_id,
                bytearray_to_bigint (
                    bytearray_reverse (bytearray_substring (data, 2, 8))
                ) AS amount,
                bytearray_to_bigint (
                    bytearray_reverse (bytearray_substring (data, 9, 8))
                ) * power(256, -1) / 1e9 AS sol_value
            FROM
                solana.instruction_calls
            WHERE
                executing_account = 'f1tUoNEKrDp1oeGn4zxr7bh41eN6VcfHjfrL3ZqQday'
                AND block_time >= from_unixtime(${options.startTimestamp})
                AND block_time <= from_unixtime(${options.endTimestamp})
        )
        SELECT
            sum(sol_value) as trading_volume
        FROM
            infinity_txns it
            INNER JOIN flt_calls fc ON it.call_tx_id = fc.tx_id
        `
      )
    )[0].trading_volume;
  const dailyVolume = options.createBalances();
  dailyVolume.addCGToken("solana", volume);

  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.SOLANA],
  dependencies: [Dependencies.DUNE],
  start: "2024-01-01", // First unstake transaction
  isExpensiveAdapter: true,
};

export default adapter;
