import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryDuneSql } from "../helpers/dune";

// FOMO app users on Solana: a trade belongs to FOMO when the transaction pays the
// USDC fee to the FOMO fee wallet, same attribution as dexs/fomo. The app and web
// products are identical, so this covers the whole listing.
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const FEE_WALLET = 'R4rNJHaffSUotNmqSKNEfDcJE8A7zJUkaoM5Jkd7cYX';

const dataAvaliableTill = (Date.now() / 1e3 - 10 * 3600) // 10 hours ago, dune solana indexing delay

const fetch = async (options: FetchOptions) => {
  if (options.endTimestamp > dataAvaliableTill)
    throw new Error("Data not available till 10 hours ago. Please try a date before: " + new Date(dataAvaliableTill * 1e3).toISOString());

  const rows = await queryDuneSql(options, `
    WITH fomo_txs AS (
      SELECT DISTINCT tx_id
      FROM tokens_solana.transfers
      WHERE TIME_RANGE
        AND to_owner = '${FEE_WALLET}'
        AND token_mint_address = '${USDC_MINT}'
    )
    SELECT
      COUNT(DISTINCT t.trader_id) AS active_users,
      COUNT(DISTINCT t.tx_id) AS txs
    FROM dex_solana.trades t
    JOIN fomo_txs f ON t.tx_id = f.tx_id
    WHERE TIME_RANGE AND t.trader_id != '${FEE_WALLET}'
  `)
  return {
    dailyActiveUsers: rows[0].active_users,
    dailyTransactionsCount: rows[0].txs,
  }
}

// version 1: dailyActiveUsers is a daily-unique count and cannot be summed from
// hourly slices, and all Dune adapters are version 1.
const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.SOLANA],
  start: '2025-04-01',
  dependencies: [Dependencies.DUNE],
  isExpensiveAdapter: true,
  methodology:
    'Counts unique traders and trade transactions routed through FOMO on Solana (transactions paying the USDC fee to the FOMO fee wallet).',
}

export default adapter
