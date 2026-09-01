import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryDuneSql } from "../helpers/dune";

const chainConfig: Record<string, { duneName: string, start: string }> = {
  [CHAIN.ETHEREUM]: {
    duneName: 'ethereum',
    start: '2023-09-19'
  },
  [CHAIN.SOLANA]: {
    duneName: 'solana',
    start: '2024-03-20'
  },
  [CHAIN.BASE]: {
    duneName: 'base',
    start: '2024-06-05'
  },
  [CHAIN.BSC]: {
    duneName: 'bnb',
    start: '2024-11-27'
  },
  [CHAIN.MONAD]: {
    duneName: 'monad',
    start: '2025-11-22'
  },
  [CHAIN.HYPERLIQUID]: {
    duneName: 'hyperevm',
    start: '2026-05-21'
  },
  [CHAIN.MEGAETH]: {
    duneName: 'megaeth',
    start: '2026-05-19'
  },
  [CHAIN.XLAYER]: {
    duneName: 'xlayer',
    start: '2026-06-23'
  },
  [CHAIN.ROBINHOOD]: {
    duneName: 'robinhood',
    start: '2026-07-03'
  },
  [CHAIN.ARBITRUM]: {
    duneName: 'arbitrum',
    start: '2026-08-19'
  }
}

// GMGN takes its 1% fee inside the swap transaction, so its volume is the dex trades that
// sit in the transactions paying its fee collectors - the same transaction set fees/gmgnai.ts
// measures. Keying on the collectors rather than on a router list also survives GMGN rotating
// routers, which it does: on ethereum the flow moved from 0x4313c378.. to 0xb030e926.. on
// 2026-01-14, and a hardcoded router would have dropped 99% of that day's volume.
const EVM_FEE_COLLECTOR = '0xb8159ba378904F803639D274cEc79F788931c9C8';
const SOLANA_FEE_WALLETS = [
  'BB5dnY55FXS1e1NXqZDwCzgdYJdMCj3B92PU6Q5Fb6DT',
  '7sHXjs1j7sDJGVSMSPjD1b4v3FD6uRSvRWfhRdfv5BiA',
  'HeZVpHj9jLwTVtMMbzQRf6mLtFPkWNSg11o68qrbUBa3',
  'ByRRgnZenY6W2sddo1VJzX9o4sMU4gPDUkcmgrpGBxRy',
  'DXfkEGoo6WFsdL7x6gLZ7r6Hw2S6HrtrAQVPWYx2A1s9',
  '3t9EKmRiAUcQUYzTZpNojzeGP1KBAVEEbDNmy6wECQpK',
  'DymeoWc5WLNiQBaoLuxrxDnDRvLgGZ1QGsEoCAM7Jsrx',
  'dBhdrmwBkRa66XxBuAK4WZeZnsZ6bHeHCCLXa3a8bTJ',
  '6TxjC5wJzuuZgTtnTMipwwULEbMPx5JPW3QwWkdTGnrn',
];

const sqlList = (xs: string[]) => xs.map((x) => `'${x}'`).join(', ');
const EVM_DUNE_CHAINS = Object.values(chainConfig).map((c) => c.duneName).filter((c) => c !== 'solana');

// Dune lags ~10h; skip days whose end is too recent to avoid undercounting.
const assertIndexed = (options: FetchOptions) => {
  const tenHoursAgo = Date.now() - 10 * 60 * 60 * 1000;
  if (options.toTimestamp * 1000 > tenHoursAgo) {
    throw new Error('End timestamp is less than 10 hours ago, skipping due to dune indexing delay');
  }
};

async function prefetch(options: FetchOptions) {
  assertIndexed(options);
  const wallets = sqlList(SOLANA_FEE_WALLETS);
  const evmChains = sqlList(EVM_DUNE_CHAINS);
  const query = `
    WITH evm_fee_txs AS (
      SELECT DISTINCT blockchain, block_date, tx_hash
      FROM tokens.transfers
      WHERE TIME_RANGE AND "to" = ${EVM_FEE_COLLECTOR} AND blockchain IN (${evmChains})
    ),
    sol_fee_txs AS (
      SELECT DISTINCT tx_id
      FROM solana.account_activity
      WHERE TIME_RANGE AND tx_success AND balance_change > 0 AND address IN (${wallets})
    )
    SELECT t.blockchain AS blockchain, SUM(t.amount_usd) AS daily_volume
    FROM dex.trades t
    INNER JOIN evm_fee_txs f ON f.blockchain = t.blockchain AND f.block_date = t.block_date AND f.tx_hash = t.tx_hash
    WHERE TIME_RANGE AND t.blockchain IN (${evmChains})
    GROUP BY 1
    UNION ALL
    SELECT 'solana' AS blockchain, SUM(t.amount_usd) AS daily_volume
    FROM dex_solana.trades t
    INNER JOIN sol_fee_txs f ON f.tx_id = t.tx_id
    WHERE TIME_RANGE AND t.trader_id NOT IN (${wallets})
    GROUP BY 1
  `;
  const queryResults = await queryDuneSql(options, query)
  if (queryResults.length === 0) {
    throw new Error('No volume data found for any chain');
  }
  return queryResults
}

async function fetch(options: FetchOptions) {
  const prefetchResults = options.preFetchedResults;
  const chainVolume = prefetchResults.find((result: any) => result.blockchain === chainConfig[options.chain].duneName);

  return {
    dailyVolume: chainVolume?.daily_volume ?? 0 // entry won't exist if chain has no volume
  }
}

const adapter: SimpleAdapter = {
  version: 1,
  prefetch,
  fetch,
  adapter: chainConfig,
  dependencies: [Dependencies.DUNE],
  isExpensiveAdapter: true,
  doublecounted: true,
  methodology: {
    Volume: "US-dollar value of the token swaps people make through GMGN, taken from Dune's decoded dex trades and restricted to the transactions that pay a GMGN fee collector. Swaps routed through venues Dune has not decoded are not included, so the figure is a floor.",
  },
};

export default adapter;
