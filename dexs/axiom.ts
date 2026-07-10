import { Dependencies, FetchOptions, SimpleAdapter } from '../adapters/types';
import { CHAIN } from '../helpers/chains';
import ADDRESSES from '../helpers/coreAssets.json';
import { queryDuneSql } from '../helpers/dune';

const feeWallets = [
  '7LCZckF6XXGQ1hDY6HFXBKWAtiUgL9QY5vj1C4Bn1Qjj',
  '4V65jvcDG9DSQioUVqVPiUcUY9v6sb6HKtMnsxSKEz5S',
  'CeA3sPZfWWToFEBmw5n1Y93tnV66Vmp8LacLzsVprgxZ',
  'AaG6of1gbj1pbDumvbSiTuJhRCRkkUNaWVxijSbWvTJW',
  '7oi1L8U9MRu5zDz5syFahsiLUric47LzvJBQX6r827ws',
  '9kPrgLggBJ69tx1czYAbp7fezuUmL337BsqQTKETUEhP',
  'DKyUs1xXMDy8Z11zNsLnUg3dy9HZf6hYZidB6WodcaGy',
  '4FobGn5ZWYquoJkxMzh2VUAWvV36xMgxQ3M7uG1pGGhd',
  '76sxKrPtgoJHDJvxwFHqb3cAXWfRHFLe3VpKcLCAHSEf',
  'H2cDR3EkJjtTKDQKk8SJS48du9mhsdzQhy8xJx5UMqQK',
  '8m5GkL7nVy95G4YVUbs79z873oVKqg2afgKRmqxsiiRm',
  '4kuG6NsAFJNwqEkac8GFDMMheCGKUPEbaRVHHyFHSwWz',
  '8vFGAKdwpn4hk7kc1cBgfWZzpyW3MEMDATDzVZhddeQb',
  '86Vh4XGLW2b6nvWbRyDs4ScgMXbuvRCHT7WbUT3RFxKG',
  'DZfEurFKFtSbdWZsKSDTqpqsQgvXxmESpvRtXkAdgLwM',
  '5L2QKqDn5ukJSWGyqR4RPvFvwnBabKWqAqMzH4heaQNB',
  'DYVeNgXGLAhZdeLMMYnCw1nPnMxkBN7fJnNpHmizTrrF',
  'Hbj6XdxX6eV4nfbYTseysibp4zZJtVRRPn2J3BhGRuK9',
  '846ah7iBSu9ApuCyEhA5xpnjHHX7d4QJKetWLbwzmJZ8',
  '5BqYhuD4q1YD3DMAYkc1FeTu9vqQVYYdfBAmkZjamyZg',
];

const bscTradeContract = '0x325098a6291a412bba7a52531ef05ac5dd7d5d6e';

const formatAddresses = (addresses: string[]) => addresses.map((a) => `'${a}'`).join(', ');

// Dune lags ~10h; skip days whose end is too recent to avoid undercounting.
const assertIndexed = (options: FetchOptions) => {
  const tenHoursAgo = Date.now() - 10 * 60 * 60 * 1000;
  if (options.toTimestamp * 1000 > tenHoursAgo) {
    throw new Error('End timestamp is less than 10 hours ago, skipping due to dune indexing delay');
  }
};

const prefetch = async (options: FetchOptions) => {
  assertIndexed(options);
  const formattedFeeWallets = formatAddresses(feeWallets);

  return queryDuneSql(options, `
    WITH axiom_txs AS (
      SELECT tx_id
      FROM solana.account_activity
      WHERE TIME_RANGE
        AND tx_success
        AND address IN (${formattedFeeWallets})
        AND balance_change > 0
    ),
    botTrades AS (
      SELECT
        t.tx_id,
        t.trader_id,
        t.amount_usd,
        t.token_bought_symbol,
        t.token_sold_symbol,
        ROW_NUMBER() OVER (
          PARTITION BY t.tx_id, t.trader_id
          ORDER BY
            CASE WHEN t.token_bought_symbol = 'WSOL' OR t.token_sold_symbol = 'WSOL' THEN 0 ELSE 1 END,
            t.amount_usd DESC
        ) AS row_num
      FROM dex_solana.trades t
      JOIN axiom_txs a ON t.tx_id = a.tx_id
      WHERE TIME_RANGE
        AND t.trader_id NOT IN (${formattedFeeWallets})
        AND (
          t.token_bought_symbol = 'WSOL'
          OR t.token_sold_symbol = 'WSOL'
          OR t.token_bought_mint_address = '${ADDRESSES.solana.SOL}'
          OR t.token_sold_mint_address = '${ADDRESSES.solana.SOL}'
        )
    )
    SELECT 'solana' AS chain, COALESCE(SUM(amount_usd), 0) AS total_volume
    FROM botTrades
    WHERE row_num = 1
    UNION ALL
    SELECT 'bnb' AS chain, COALESCE(SUM(amount_usd), 0) AS total_volume
    FROM dex.trades
    WHERE blockchain = 'bnb'
      AND TIME_RANGE
      AND tx_to = ${bscTradeContract}
  `);
};

const fetch: any = async (options: FetchOptions) => {
  assertIndexed(options);

  const target = options.chain === CHAIN.BSC ? 'bnb' : 'solana';
  const row = (options.preFetchedResults || []).find((r: any) => r.chain === target);

  return { dailyVolume: row.total_volume };
};

const adapter: SimpleAdapter = {
  version: 1,
  dependencies: [Dependencies.DUNE],
  fetch,
  prefetch,
  methodology: {
    Volume: "Total USD volume of spot swaps made through Axiom. On Solana it counts trades whose transaction paid a fee to Axiom, and on BSC trades routed through Axiom's trading contract.",
  },
  adapter: {
    [CHAIN.SOLANA]: { start: '2025-01-21' },
    [CHAIN.BSC]: { start: '2026-01-25' },
  },
  isExpensiveAdapter: true,
  doublecounted: true,
};

export default adapter;
