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

// Axiom's current trade contract, deployed at the same address on every EVM chain (BSC and Robinhood
// since 2026-09-06, the others since 2026-09-09).
const TRADE_CONTRACT = '0x9689992f5b5c09447f15906d8d11214944488341';

// duneChain: the chain's name in Dune. tradeContracts (EVM only): Axiom rotates trade contracts and old
// ones keep trading for a while after a new one is live, so match on all of them rather than switching
// by date. Same lists as fees/axiom.ts.
const chainConfig: Record<string, { start: string; duneChain: string; tradeContracts?: string[] }> = {
  [CHAIN.SOLANA]: { start: '2025-01-21', duneChain: 'solana' },
  [CHAIN.BSC]: {
    start: '2025-12-25',
    duneChain: 'bnb',
    tradeContracts: [
      '0x5da7dd96efa6127e68c8ab06f125124c3c05d18d', // 2025-12-25 to 2026-01-30
      '0x325098a6291a412bba7a52531ef05ac5dd7d5d6e', // old trade contract
      '0x05701DC0b8F6711f6DE3B282f46B10c813AFb02d', // new trade contract
      TRADE_CONTRACT,
    ],
  },
  [CHAIN.ROBINHOOD]: {
    start: '2026-07-10',
    duneChain: 'robinhood',
    tradeContracts: [
      '0xcda14e87628317e4f90077750fbe9634b896a24f',
      '0x76a0e120631735845769e3de2606924af7716150',
      '0xc6cdc85a225236013ee9b3b47dd05c07aed1fabc',
      '0x105358a03c47706ad4697e227d5a8ddfacf85448',
      '0xe3dc74b2d5b83916a1682777f1de8b2155ddfc38',
      '0xd9fc1771672f08f3abce96d033cc21d1e5a3ac7f',
      '0x578980d6cac7ab262c40dfca650b1d2d259c1cca',
      '0x4a86009a36fcec5aa341ffceb3205a911fcf6f60',
      TRADE_CONTRACT,
    ],
  },
  [CHAIN.ETHEREUM]: {
    start: '2026-04-28',
    duneChain: 'ethereum',
    tradeContracts: ['0xe44f80d8b61762fdb03dc754247c0b2d3ddf456b', TRADE_CONTRACT], // first one 2026-04-28 to 2026-09-08
  },
  [CHAIN.BASE]: { start: '2026-09-09', duneChain: 'base', tradeContracts: [TRADE_CONTRACT] },
  [CHAIN.HYPERLIQUID]: { start: '2026-09-11', duneChain: 'hyperevm', tradeContracts: [TRADE_CONTRACT] },
  [CHAIN.ARC]: { start: '2026-09-15', duneChain: 'arc', tradeContracts: [TRADE_CONTRACT] },
  [CHAIN.INK]: { start: '2026-09-09', duneChain: 'ink', tradeContracts: [TRADE_CONTRACT] },
};

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
        -- one leg per trade: prefer the SOL leg as the notional, else the largest leg
        ROW_NUMBER() OVER (
          PARTITION BY t.tx_id, t.trader_id
          ORDER BY
            CASE WHEN t.token_bought_mint_address = '${ADDRESSES.solana.SOL}'
                   OR t.token_sold_mint_address = '${ADDRESSES.solana.SOL}' THEN 0 ELSE 1 END,
            t.amount_usd DESC
        ) AS row_num
      FROM dex_solana.trades t
      JOIN axiom_txs a ON t.tx_id = a.tx_id
      WHERE TIME_RANGE
        AND t.trader_id NOT IN (${formattedFeeWallets})
    )
    SELECT 'solana' AS chain, COALESCE(SUM(amount_usd), 0) AS total_volume
    FROM botTrades
    WHERE row_num = 1
    ${Object.values(chainConfig).filter((config) => config.tradeContracts).map(({ duneChain, tradeContracts }) => `
    UNION ALL
    SELECT '${duneChain}' AS chain, COALESCE(SUM(swap_usd), 0) AS total_volume
    FROM (
      -- dex.trades has a row per pool hop; keep the largest row of each tx. Users call the trade contract
      -- directly (tx_to), so a tx is one user's swap: one trade event per tx on BSC and Robinhood, sampled 2026-11-05.
      SELECT tx_hash, MAX(amount_usd) AS swap_usd
      FROM dex.trades
      WHERE blockchain = '${duneChain}'
        AND TIME_RANGE
        AND tx_to IN (${tradeContracts!.join(', ')})
      GROUP BY tx_hash
    )`).join('')}
  `);
};

const fetch: any = async (options: FetchOptions) => {
  assertIndexed(options);

  const target = chainConfig[options.chain].duneChain;
  const row = options.preFetchedResults.find((r: any) => r.chain === target);
  if (!row) throw new Error(`Axiom: no prefetched Dune result for ${target}`);

  return { dailyVolume: row.total_volume };
};

const adapter: SimpleAdapter = {
  version: 1,
  dependencies: [Dependencies.DUNE],
  fetch,
  prefetch,
  methodology: {
    Volume: "Total US-dollar value of the token swaps people make through Axiom, counting each swap once even when it is routed through several pools. A swap counts when its transaction pays a fee to Axiom. Swaps Axiom routes through venues that are not yet indexed are not included, so the figure is a floor.",
  },
  adapter: chainConfig,
  isExpensiveAdapter: true,
  doublecounted: true,
};

export default adapter;
