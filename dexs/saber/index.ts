/**
 * Saber Volume Adapter
 * 
 * This adapter fetches and processes the previous day's volume data for Saber pools.
 * It retrieves volume data and pool information, then calculates the adjusted volume
 * based on token decimals. The adjusted volume is used to provide accurate volume
 * metrics for each token in the pool.
 * 
 */

import { CHAIN } from '../../helpers/chains';
import { Dependencies, FetchOptions, SimpleAdapter } from '../../adapters/types';
import { queryDuneSql } from "../../helpers/dune"

async function fetch(_t: any, _a: any, options: FetchOptions) {
  const dailyVolume = options.createBalances()
  const query = `
  WITH amounts AS (
    SELECT 
      SUM(varbinary_to_bigint(reverse(varbinary_substring(data, 2, 8)))) as inAmount,
      account_arguments[5] AS poolSource
    FROM solana.instruction_calls
    WHERE inner_executing_account = 'SSwpkEEcbUqx4vtoEByFjSkhKdCT862DNVb52nZg1UZ'
    AND TIME_RANGE
    AND is_inner = true
    AND tx_success = true
    GROUP BY 2
  )
  SELECT amounts.inAmount AS amount, ta.token_mint_address AS mint
  FROM amounts
  INNER JOIN solana_utils.token_accounts ta
  ON amounts.poolSource = ta.address`

 const result = await queryDuneSql(options, query)
 result.forEach((result: Record<string, any>) => dailyVolume.add(result.mint, result.amount))

 return {
  dailyVolume
 }
}

const adapter : SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.SOLANA],
  start: "2021-06-26",
  dependencies: [Dependencies.DUNE],
  isExpensiveAdapter: true
}

export default adapter