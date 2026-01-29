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
  const dailyFees = options.createBalances()

  const query = `
  WITH transactions AS (
    SELECT 
      varbinary_to_bigint(reverse(varbinary_substring(data, 2, 8))) as inAmount,
      account_arguments[5] AS poolSource,
      account_arguments[6] as poolDestination,
      account_arguments[8] as adminAddress,
      tx_id
    FROM solana.instruction_calls
    WHERE executing_account = 'SSwpkEEcbUqx4vtoEByFjSkhKdCT862DNVb52nZg1UZ'
    AND TIME_RANGE
    AND varbinary_substring(data, 1, 1) = 0x01
    AND tx_success = true
  ),
  fees AS (
    SELECT SUM(amount_usd) as fees, token_mint_address as mint
    FROM tokens_solana.transfers t
    INNER JOIN transactions
    ON transactions.poolDestination = t.from_token_account 
    AND transactions.adminAddress = t.to_token_account 
    AND transactions.tx_id = t.tx_id
    WHERE TIME_RANGE
    GROUP BY token_mint_address
  ), 
  volume AS (
    SELECT SUM(transactions.inAmount) AS volume, ta.token_mint_address AS mint
    FROM transactions
    INNER JOIN solana_utils.token_accounts ta
    ON transactions.poolSource = ta.address
    GROUP BY ta.token_mint_address
  )
  SELECT 
    COALESCE(f.mint, v.mint) as mint,
    COALESCE(f.fees, 0) as fees,
    COALESCE(v.volume, 0) as volume
  FROM fees f
  FULL OUTER JOIN volume v 
  ON f.mint = v.mint`

  const result = await queryDuneSql(options, query)
  result.forEach((row: Record<string, any>) => {
    dailyVolume.add(row.mint, row.volume)
    dailyFees.addUSDValue(row.fees)
  })
  const dailySupplySideRevenue = dailyFees.clone(0.5)
  const dailyRevenue = dailyFees.clone(0.5)  
  return {
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees,
    dailySupplySideRevenue,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue
  }
}

const adapter : SimpleAdapter = {
  version: 1,
  fetch,
  methodology: {
    Fees: 'Swap fees paid by users',
    UserFees: 'Swap fees paid by users',
    SupplySideRevenue: 'Half of the swap fees go to LPs',
    Revenue: 'Half ot the swap fees go to the protocol',
    ProtocolRevenue: 'Half of the swap fees go to the protocol'
  },
  chains: [CHAIN.SOLANA],
  start: "2021-05-28",
  dependencies: [Dependencies.DUNE],
  isExpensiveAdapter: true
}

export default adapter