import ADDRESSES from '../helpers/coreAssets.json';
import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryDuneSql } from "../helpers/dune";

// duneName is unset for chains Dune doesn't index; their volume comes from GMGN's router logs (see ELYSIUM_ROUTERS)
const chainConfig: Record<string, { duneName?: string, start: string }> = {
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
  },
  [CHAIN.ARC]: {
    duneName: 'arc',
    start: '2026-09-16'
  },
  [CHAIN.ELYSIUM]: {
    start: '2026-11-09'
  }
}

const ELYSIUM_ROUTERS = ['0x6c3c2efa01a8240c00a683e36502f656f0c15fd6'];
const ElysiumSwapEvent = 'event Swap(address indexed sender, address indexed recipient, address indexed feeToken, uint256 amountIn, uint256 amountOut, (uint8 kind, address tokenIn, address tokenOut, address pool, uint24 fee, int24 tickSpacing, address hooks, bytes hookData, address poolManager, bytes32 poolId)[] route)';

async function fetchElysiumVolume(options: FetchOptions) {
  const dailyVolume = options.createBalances();
  const logs = await options.getLogs({ targets: ELYSIUM_ROUTERS, eventAbi: ElysiumSwapEvent });
  for (const log of logs) {
    const feeToken = log.feeToken.toLowerCase();
    const isFeeSide = (token: string) => token.toLowerCase() === feeToken
      || (feeToken === ADDRESSES.null && token.toLowerCase() === ADDRESSES.elysium.WHYPE.toLowerCase());
    if (isFeeSide(log.route[0].tokenIn)) dailyVolume.add(feeToken, log.amountIn);
    else if (isFeeSide(log.route[log.route.length - 1].tokenOut)) dailyVolume.add(feeToken, log.amountOut);
  }
  return dailyVolume;
}

// GMGN takes its 1% fee inside the swap transaction, so its volume is the dex trades that
// sit in the transactions paying its fee collectors - the same transaction set fees/gmgnai.ts
// measures. Keying on the collectors rather than on a router list also survives GMGN rotating
// routers, which it does: on ethereum the flow moved from 0x4313c378.. to 0xb030e926.. on
// 2026-01-14, and a hardcoded router would have dropped 99% of that day's volume.
const EVM_FEE_COLLECTORS = ['0xb8159ba378904F803639D274cEc79F788931c9C8', '0xe3ed4c49c9807367784ab0d0d087d8a6815e7427'];
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

// GMGN takes its fee in the native gas token and in the chain's main stablecoin - the same assets
// fees/gmgnai.ts books as fees. Matching the fee asset by contract address means a token someone
// sends to the collector cannot mark an unrelated swap as GMGN's. A chain with no entry here still
// counts its native-token fees.
const NATIVE = ADDRESSES.null;
const FEE_STABLE_BY_CHAIN: Record<string, string> = {
  ethereum: ADDRESSES.ethereum.USDC,
  bnb: ADDRESSES.bsc.USDC,
  base: ADDRESSES.base.USDC,
  monad: (ADDRESSES as any).monad?.USDC,
  hyperevm: (ADDRESSES as any).hyperliquid?.USDC,
  robinhood: ADDRESSES.robinhood.USDG, // usdg is the main stablecoin on robinhood
  arbitrum: (ADDRESSES as any).arbitrum?.USDC_CIRCLE, // arbitrum.USDC is bridged USDC.e
  arc: (ADDRESSES as any).arc?.USDC,
};

const sqlList = (xs: string[]) => xs.map((x) => `'${x}'`).join(', ');
const EVM_DUNE_CHAINS = Object.values(chainConfig).map((c) => c.duneName).filter((c): c is string => !!c && c !== 'solana');
const evmFeeFilter = EVM_DUNE_CHAINS
  .map((chain) => `(blockchain = '${chain}' AND contract_address IN (${[NATIVE, FEE_STABLE_BY_CHAIN[chain]].filter(Boolean).join(', ')}))`)
  .join(' OR ');

// Dune lags ~10h; skip days whose end is too recent to avoid undercounting.
const assertIndexed = (options: FetchOptions) => {
  const tenHoursAgo = Date.now() - 10 * 60 * 60 * 1000;
  if (options.toTimestamp * 1000 > tenHoursAgo) {
    throw new Error('End timestamp is less than 10 hours ago, skipping due to dune indexing delay');
  }
};

// dex.trades and dex_solana.trades have one row per pool hop, so a routed swap has to be collapsed
// to one row. EVM keeps the largest row per transaction: dex.trades.taker changes from hop to hop
// (the user, then the router), so a (tx_hash, taker) key still counts many swaps twice. Over
// 2026-10-03..11-01 at most 557 of 3.63M multi-row EVM transactions pay more than 1.05% of the row
// kept, which is what merging separate swaps would look like. Solana keeps one row per
// (tx_id, trader_id), the SOL leg if there is one, because a decoded non-SOL row can be far larger
// than the swap itself.
async function prefetch(options: FetchOptions) {
  assertIndexed(options);
  const wallets = sqlList(SOLANA_FEE_WALLETS);
  const evmChains = sqlList(EVM_DUNE_CHAINS);
  const query = `
    WITH evm_fee_txs AS (
      SELECT DISTINCT blockchain, block_date, tx_hash
      FROM tokens.transfers
      WHERE TIME_RANGE AND "to" IN (${EVM_FEE_COLLECTORS.join(',')})
    ),
    sol_fee_txs AS (
      SELECT DISTINCT tx_id
      FROM solana.account_activity
      WHERE TIME_RANGE AND tx_success AND balance_change > 0 AND address IN (${wallets})
    ),
    evm_swaps AS (
      SELECT t.blockchain, t.tx_hash, MAX(t.amount_usd) AS amount_usd
      FROM dex.trades t
      INNER JOIN evm_fee_txs f ON f.blockchain = t.blockchain AND f.block_date = t.block_date AND f.tx_hash = t.tx_hash
      WHERE TIME_RANGE AND t.blockchain IN (${evmChains})
      GROUP BY 1, 2
    ),
    sol_hops AS (
      SELECT
        t.amount_usd,
        ROW_NUMBER() OVER (
          PARTITION BY t.tx_id, t.trader_id
          ORDER BY
            CASE WHEN t.token_bought_mint_address = '${ADDRESSES.solana.SOL}'
                   OR t.token_sold_mint_address = '${ADDRESSES.solana.SOL}' THEN 0 ELSE 1 END,
            t.amount_usd DESC
        ) AS row_num
      FROM dex_solana.trades t
      INNER JOIN sol_fee_txs f ON f.tx_id = t.tx_id
      WHERE TIME_RANGE AND t.trader_id NOT IN (${wallets})
    )
    SELECT blockchain, SUM(amount_usd) AS daily_volume
    FROM evm_swaps
    GROUP BY 1
    UNION ALL
    SELECT 'solana' AS blockchain, SUM(amount_usd) AS daily_volume
    FROM sol_hops
    WHERE row_num = 1
    GROUP BY 1
  `;
  const queryResults = await queryDuneSql(options, query)
  if (queryResults.length === 0) {
    throw new Error('No volume data found for any chain');
  }
  return queryResults
}

async function fetch(options: FetchOptions) {
  if (options.chain === CHAIN.ELYSIUM) return { dailyVolume: await fetchElysiumVolume(options) };
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
    Volume: "US-dollar value of the token swaps people make through GMGN, taken from Dune's decoded dex trades and restricted to the transactions that pay a GMGN fee collector, counting each swap once even when it is routed through several pools. Swaps routed through venues Dune has not decoded are not included, so the figure is a floor. Elysium, which Dune does not index, counts the HYPE or USDC side of each swap logged by GMGN's router there.",
  },
};

export default adapter;