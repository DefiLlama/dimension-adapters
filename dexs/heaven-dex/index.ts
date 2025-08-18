import { FetchOptions, SimpleAdapter } from '../../adapters/types';
import { CHAIN } from '../../helpers/chains';
import { queryDuneSql } from '../../helpers/dune';

const fetch: any = async (_a: any, _b: any, options: FetchOptions) => {

  const query = `
      WITH buy_instructions AS (
        SELECT 
          block_time,
          block_slot,
          tx_id,
          executing_account,
          outer_executing_account,
          'buy' as trade_type,
          bytearray_to_uint256(bytearray_reverse(bytearray_substring(data, 9, 8))) as lamport_amount_raw,
          bytearray_to_uint256(bytearray_reverse(bytearray_substring(data, 9, 8))) / 1e9 as sol_amount,
          account_arguments[6] as trader_id,
          account_arguments[7] as token_address
        FROM solana.instruction_calls
        WHERE block_time >= from_unixtime(${options.startTimestamp})
        AND block_time <= from_unixtime(${options.endTimestamp})
        AND executing_account = 'HEAVENoP2qxoeuF8Dj2oT1GHEnu49U5mJYkdeC8BAX2o'
        AND outer_executing_account = 'HEAVENoP2qxoeuF8Dj2oT1GHEnu49U5mJYkdeC8BAX2o'
        AND bytearray_substring(data, 1, 4) = 0x66063d12
        AND tx_success = true
      ),
      sell_main_instructions AS (
        SELECT
          block_time,
          block_slot,
          tx_id,
          executing_account,
          outer_executing_account,
          'sell' as trade_type,
          account_arguments[6] as trader_id,
          account_arguments[7] as token_address,
          outer_instruction_index
        FROM solana.instruction_calls
        WHERE block_time >= from_unixtime(${options.startTimestamp})
        AND block_time <= from_unixtime(${options.endTimestamp})
        AND executing_account = 'HEAVENoP2qxoeuF8Dj2oT1GHEnu49U5mJYkdeC8BAX2o'
        AND outer_executing_account = 'HEAVENoP2qxoeuF8Dj2oT1GHEnu49U5mJYkdeC8BAX2o'
        AND bytearray_substring(data, 1, 4) = 0x33e685a4
        AND tx_success = true
      ),
      sell_instructions AS (
        SELECT
          mi.block_time,
          mi.block_slot,
          mi.tx_id,
          mi.executing_account,
          mi.outer_executing_account, 
          mi.trade_type,
          bytearray_to_uint256(bytearray_reverse(bytearray_substring(ic.data, 2, 4))) as lamport_amount_raw,
          bytearray_to_uint256(bytearray_reverse(bytearray_substring(ic.data, 2, 4))) / 1e9 as sol_amount,
          mi.trader_id,
          mi.token_address
        FROM solana.instruction_calls ic
        join sell_main_instructions mi on ic.tx_id = mi.tx_id and ic.outer_instruction_index = mi.outer_instruction_index
        WHERE ic.block_time >= from_unixtime(${options.startTimestamp})
        AND ic.block_time <= from_unixtime(${options.endTimestamp})
        AND ic.executing_account = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'
        AND ic.outer_executing_account = 'HEAVENoP2qxoeuF8Dj2oT1GHEnu49U5mJYkdeC8BAX2o'
        AND bytearray_substring(ic.data, 1, 1) = 0x0c
        AND ic.is_inner = true
        AND ic.tx_success = true
      ),
      all_transactions AS (
        SELECT * FROM buy_instructions
        UNION ALL
        SELECT * FROM sell_instructions
      ),
      prices as (
        select price, minute
        from prices.usd
        where contract_address = FROM_BASE58('So11111111111111111111111111111111111111112')
        and minute >= from_unixtime(${options.startTimestamp})
        and minute <= from_unixtime(${options.endTimestamp})
      ),
      txs as (
        SELECT
          a.sol_amount * COALESCE(p.price, 0) as amount_usd
        FROM all_transactions a
        LEFT JOIN prices p
          on p.minute = DATE_TRUNC('minute', a.block_time)
      )
      SELECT 
        sum(amount_usd) as dailyVolume
      from txs
    `
  const res = await queryDuneSql(options, query);
  const dailyVolume = options.createBalances();
  dailyVolume.addUSDValue(res[0].dailyVolume || 0);

  return { dailyVolume };
};


const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.SOLANA],
  start: '2025-08-13',
  isExpensiveAdapter: true,
};

export default adapter;
