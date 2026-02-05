/*
Futarchy AMM Volume

Calculates total USDC-equivalent swap volume via the Futarchy AMM.
- Buy swaps: volume = USDC input
- Sell swaps: volume = USDC output

Parameters:
  {{start}} - Unix timestamp for start of period
  {{end}} - Unix timestamp for end of period
*/

import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const sql = `
    WITH futswap AS (
        SELECT
            CASE
                WHEN to_hex(SUBSTR(data, 105, 1)) = '00' THEN 'buy'
                WHEN to_hex(SUBSTR(data, 105, 1)) = '01' THEN 'sell'
            END AS swap_type,
            from_big_endian_64(reverse(SUBSTR(data, 106, 8))) / 1e6 AS input_amount,
            from_big_endian_64(reverse(SUBSTR(data, 114, 8))) / 1e6 AS output_amount
        FROM solana.instruction_calls
        WHERE TIME_RANGE
          AND executing_account = 'FUTARELBfJfQ8RDGhg1wdhddq1odMAJUePHFuBYfUxKq'
          AND inner_executing_account = 'FUTARELBfJfQ8RDGhg1wdhddq1odMAJUePHFuBYfUxKq'
          AND account_arguments[1] = 'DGEympSS4qLvdr9r3uGHTfACdN8snShk4iGdJtZPxuBC'
          AND cardinality(account_arguments) = 1
          AND is_inner = true
          AND tx_success = true
          AND CAST(data AS VARCHAR) LIKE '0xe445a52e51cb9a1d%'
          AND LENGTH(data) >= 300
          AND array_join(log_messages, ' ') LIKE '%SpotSwap%'
    )
    SELECT 
      SUM(CASE 
        WHEN swap_type = 'buy' THEN input_amount 
        ELSE output_amount 
      END) AS volume
    FROM futswap
    WHERE swap_type IN ('buy', 'sell')
  `
  const result = await queryDuneSql(options, sql);
  const volume = result[0]?.volume ?? 0;
  dailyVolume.addUSDValue(volume);

  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.SOLANA],
  start: '2025-10-09',
  dependencies: [Dependencies.DUNE],
  isExpensiveAdapter: true,
};

export default adapter;
