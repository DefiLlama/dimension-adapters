import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryDuneSql } from "../helpers/dune";

const fetch: any = async (_a: any, _b: any, options: FetchOptions) => {

  // Query to track volume by decoding TokenBuyExactIn and TokenSellExactIn events
  // Program address: waveQX2yP3H1pVU8djGvEHmYg8uamQ84AuyGtpsrXTF
  const value = (await queryDuneSql(options,
    `WITH wavebreak_trades AS (
      SELECT 
        tx_id,
        block_time,
        data,
        account_arguments,
        CASE 
          WHEN bytearray_substring(data, 1, 1) = from_hex('08') THEN 'TokenBuyExactIn'
          WHEN bytearray_substring(data, 1, 1) = from_hex('0a') THEN 'TokenSellExactIn'
        END as trade_type,
        bytearray_to_bigint(bytearray_reverse(bytearray_substring(data, 2, 8))) as amount_in
      FROM solana.instruction_calls
      WHERE executing_account = 'waveQX2yP3H1pVU8djGvEHmYg8uamQ84AuyGtpsrXTF'
        AND block_time >= from_unixtime(${options.startTimestamp})
        AND block_time <= from_unixtime(${options.endTimestamp})
        AND tx_success = true
        AND (
          bytearray_substring(data, 1, 1) = from_hex('08') OR  -- TokenBuyExactIn
          bytearray_substring(data, 1, 1) = from_hex('0a')     -- TokenSellExactIn
        )
    ),

    wavebreak_trades_with_mints AS (
      SELECT 
        trade_type,
        amount_in,
        CASE 
          WHEN trade_type = 'TokenBuyExactIn' THEN account_arguments[5]
          WHEN trade_type = 'TokenSellExactIn' THEN account_arguments[3]
        END as amount_in_mint,
        account_arguments[3] as base_mint,
        account_arguments[5] as quote_mint
      FROM wavebreak_trades
      WHERE amount_in > 0
    ),

    aggregated_by_mint AS (
      SELECT 
        amount_in_mint,
        trade_type,
        SUM(amount_in) as total_amount,
        COUNT(*) as trade_count
      FROM wavebreak_trades_with_mints
      GROUP BY amount_in_mint, trade_type
    ),

    mint_totals_with_decimals AS (
      SELECT 
        a.amount_in_mint,
        a.trade_type,
        a.total_amount,
        a.trade_count,
        COALESCE(tf.decimals, 9) as token_decimals
      FROM aggregated_by_mint a
      LEFT JOIN tokens_solana.fungible tf ON tf.token_mint_address = a.amount_in_mint
    )

    SELECT
      amount_in_mint,
      trade_type,
      total_amount,
      trade_count,
      token_decimals
    FROM mint_totals_with_decimals
    ORDER BY total_amount DESC
    `)
  );

  let dailyVolume = options.createBalances();

  for (const mintData of value) {
    dailyVolume.add(mintData.amount_in_mint, mintData.total_amount)
  }

  return {
    dailyVolume
  }
}

const adapter: SimpleAdapter = {
  version: 1,
  dependencies: [Dependencies.DUNE],
  adapter: {
    [CHAIN.SOLANA]: {
      fetch,
      start: '2025-05-27',
    },
  },
  isExpensiveAdapter: true
};

export default adapter;
