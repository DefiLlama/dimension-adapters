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
        flatfee_calls AS (
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
                AND tx_success = true
        ),
        flatslab_calls AS (
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
                executing_account = 's1b6NRXj6ygNu1QMKXh2H9LUR2aPApAAm1UQ2DjdhNV'
                AND block_time >= from_unixtime(${options.startTimestamp})
                AND block_time <= from_unixtime(${options.endTimestamp})
                AND tx_success = true
                AND bytearray_to_bigint (
                    bytearray_reverse (bytearray_substring (data, 0, 8))
                ) = 0
        ),
        joined_txns AS (
          SELECT
              it.call_tx_id,
              COALESCE(ff.sol_value, fs.sol_value) AS sol_amount
          FROM
              infinity_txns it
              LEFT JOIN flatfee_calls ff ON it.call_tx_id = ff.tx_id
              LEFT JOIN flatslab_calls fs ON it.call_tx_id = fs.tx_id
        )
        SELECT
            SUM(sol_amount) AS trading_volume
        FROM
            joined_txns
        `
      )
    )[0].trading_volume;
  const dailyVolume = options.createBalances();
  dailyVolume.addCGToken("solana", volume ? volume : 0);

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
