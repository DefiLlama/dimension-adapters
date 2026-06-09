import { Dependencies, FetchOptions, SimpleAdapter } from '../../adapters/types';
import { CHAIN } from '../../helpers/chains';
import { queryDuneSql } from '../../helpers/dune';

const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const FEE_WALLET = 'R4rNJHaffSUotNmqSKNEfDcJE8A7zJUkaoM5Jkd7cYX';

const fetch = async (options: FetchOptions) => {

  const now = Date.now()
  const tenHoursAgo = now - (10 * 60 * 60 * 1000)
  if ((options.toTimestamp * 1000) > tenHoursAgo) {
    throw new Error("End timestamp is less than 10 hours ago, skipping due to dune indexing delay")
  }

  const result = await queryDuneSql(options, `
    WITH fomo_txs AS (
      SELECT DISTINCT tx_id
      FROM tokens_solana.transfers
      WHERE TIME_RANGE
        AND to_owner = '${FEE_WALLET}'
        AND token_mint_address = '${USDC_MINT}'
    ),
    botTrades AS (
      SELECT
        t.tx_id,
        t.amount_usd
      FROM dex_solana.trades t
      JOIN fomo_txs f ON t.tx_id = f.tx_id
      WHERE TIME_RANGE
        AND t.trader_id != '${FEE_WALLET}'
        AND (
          t.token_bought_mint_address = '${USDC_MINT}'
          OR t.token_sold_mint_address = '${USDC_MINT}'
          OR t.token_bought_symbol = 'USDC'
          OR t.token_sold_symbol = 'USDC'
        )
    )
    SELECT COALESCE(SUM(amount_usd), 0) AS total_volume
    FROM botTrades
  `);

  return { dailyVolume: result[0].total_volume };
};

const adapter: SimpleAdapter = {
  version: 1,
  dependencies: [Dependencies.DUNE],
  fetch,
  chains: [CHAIN.SOLANA],
  start: '2025-04-01',
  methodology: {
    Volume: 'Total USD trading volume of spot swaps routed through FOMO.',
  },
  isExpensiveAdapter: true,
  doublecounted: true,
};

export default adapter;
