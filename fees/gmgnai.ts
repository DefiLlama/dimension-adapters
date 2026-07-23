import ADDRESSES from '../helpers/coreAssets.json'
// source: https://dune.com/adam_tehc/gmgn
// Per-day, per-chain fee query (backs the historical cache): https://dune.com/queries/7819191

import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryDuneResult, queryDuneSql } from "../helpers/dune";
import { METRIC } from '../helpers/metrics';

const feeCollector = '0xb8159ba378904F803639D274cEc79F788931c9C8'

const chainConfig: Record<string, { start: string }> = {
  [CHAIN.BSC]: {
    start: '2024-11-27'
  },
  [CHAIN.ETHEREUM]: {
    start: '2023-09-19'
  },
  [CHAIN.BASE]: {
    start: '2024-06-05'
  },
  [CHAIN.MONAD]: {
    start: '2025-11-22'
  },
  [CHAIN.HYPERLIQUID]: {
    start: '2026-05-21'
  },
  [CHAIN.MEGAETH]: {
    start: '2026-05-19'
  },
  [CHAIN.SOLANA]: {
    start: '2024-03-20'
  },
}

// GMGN's nine Solana fee-collection wallets. Verified on-chain (2026-06) to be
// pure fee collectors: they only receive per-trade fee inflows and sweep to a
// single treasury (GbYZ7hHx...), with zero transfers among themselves, so every
// positive native-SOL balance_change to them is a fee with no double-counting.
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

// EVM chains: [Dune `tokens.transfers` blockchain name, canonical USDC].
// GMGN takes its 1% fee in the native gas token AND USDC; both are summed in USD
// (Dune prices native on every chain, incl. monad/hyperevm/megaeth that DefiLlama
// may not). USDC is matched by contract (not symbol) to ignore impostor tokens.
const EVM_CHAINS: Record<string, { dune: string; usdc?: string }> = {
  [CHAIN.ETHEREUM]: { dune: 'ethereum', usdc: ADDRESSES.ethereum.USDC },
  [CHAIN.BSC]: { dune: 'bnb', usdc: ADDRESSES.bsc.USDC },
  [CHAIN.BASE]: { dune: 'base', usdc: ADDRESSES.base.USDC },
  [CHAIN.MONAD]: { dune: 'monad', usdc: (ADDRESSES as any).monad?.USDC },
  [CHAIN.HYPERLIQUID]: { dune: 'hyperevm', usdc: (ADDRESSES as any).hyperliquid?.USDC },
  [CHAIN.MEGAETH]: { dune: 'megaeth' },
};

// Solana referral-distribution wallets: GMGN funds these (mainly from BCNsHAH28…)
// and they fan out per-trade referral commissions to thousands of referrers in
// SOL + USDC/USDT/USD1 (verified 2026-06: 3,166 distinct SOL recipients over 90d,
// ≈34% of Solana fees, in line with the 10-30% docs + peer bots). Their outflows
// are GMGN's referral payouts = SupplySideRevenue, paid out of the collected fees.
const SOLANA_REFERRAL_WALLETS = [
  'EzcD6Kc7GYBqBdRo6Lnv3YiwpAUtxYtb5xKWw8r7Q7H8',
  'Tw5uhE2uyApRCt9LqN6qMSiEeLYvzvC3P5ToEvTeGEi',
  '69SNcRC8NqjHBSXEcugCN5oFKRQoKmddmWzZYc3tqtxk',
];
// Internal counterparties excluded from referral outflows (the 3 wallets + the
// GMGN funding wallet) so only true referrer payouts count as supply-side.
const SOLANA_REFERRAL_INTERNAL = [...SOLANA_REFERRAL_WALLETS, 'BCNsHAH2887uUF4gdZsph28oNYbgpjgrtVk7Fi7yN67t'];
// Stablecoins GMGN pays referral in (all 6dp ≈ $1; summed and booked as USDC).
const SOLANA_REFERRAL_STABLES = [
  ADDRESSES.solana.USDC,
  'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', // USDT
  'USD1ttGY1N17NEEHLmELoaybftRBUSErhqYiQzvEmuB',  // USD1
];
// Real referral payouts are small per-referrer; any single referral transfer
// worth >= $150k is a treasury/CEX move (e.g. Coinbase deposits) misrouted
// through these wallets, so it is excluded. SOL is valued via prices.usd_daily;
// stables are ~$1 so the raw amount is the USD value.
const REFERRAL_MAX_USD = 150000;

const NATIVE = '0x0000000000000000000000000000000000000000';
const sqlList = (xs: string[]) => xs.map((x) => `'${x}'`).join(', ');

// Single query for ALL chains, one row per (day, chain). EVM legs report fees in
// USD; Solana reports raw native-SOL (lamports) + raw USDC (6dp) fees plus
// referral payouts (ref_sol_raw lamports + ref_stable_raw 6dp) so DefiLlama
// prices the (dominant) SOL leg itself. Mirrors the saved query (7819191) used
// for the historical cache. TIME_RANGE is expanded by the dune helper per table.
const liveQuery = () => {
  const evmFilter = Object.values(EVM_CHAINS)
    .map(({ dune, usdc }) => `(blockchain = '${dune}' AND contract_address IN (${[NATIVE, usdc].filter(Boolean).join(', ')}))`)
    .join(' OR ');
  const wallets = sqlList(SOLANA_FEE_WALLETS);
  const refWallets = sqlList(SOLANA_REFERRAL_WALLETS);
  const refInternal = sqlList(SOLANA_REFERRAL_INTERNAL);
  const refStables = sqlList(SOLANA_REFERRAL_STABLES);
  return `
    WITH evm AS (
      SELECT CAST(date(block_time) AS varchar) AS day, blockchain AS chain,
             CAST(NULL AS double) AS sol_raw, CAST(NULL AS double) AS usdc_raw,
             SUM(amount_usd) AS usd, CAST(NULL AS double) AS ref_sol_raw, CAST(NULL AS double) AS ref_stable_raw
      FROM tokens.transfers
      WHERE TIME_RANGE AND "to" = ${feeCollector} AND (${evmFilter})
      GROUP BY 1, 2
    ),
    sol_parts AS (
      -- native-SOL fees (account_activity balance_change)
      SELECT CAST(date(block_time) AS varchar) AS day,
             CAST(balance_change AS double) AS sol_raw, 0e0 AS usdc_raw, 0e0 AS ref_sol_raw, 0e0 AS ref_stable_raw
      FROM solana.account_activity
      WHERE TIME_RANGE AND address IN (${wallets}) AND tx_success AND balance_change > 0
      UNION ALL
      -- USDC fees (SPL inflow to fee wallets). Kept as its own scan: a single
      -- AND-predicate pushes down and reads far less than an OR-combined scan.
      SELECT CAST(date(block_time) AS varchar), 0e0, CAST(amount AS double), 0e0, 0e0
      FROM tokens_solana.transfers
      WHERE TIME_RANGE AND action = 'transfer'
        AND token_mint_address = '${ADDRESSES.solana.USDC}' AND to_owner IN (${wallets})
      UNION ALL
      -- referral payouts in native SOL (outflows from referral wallets), excluding
      -- single transfers >= $150k (treasury/CEX spikes) via the daily SOL price.
      SELECT CAST(date(s.block_time) AS varchar), 0e0, 0e0, CAST(s.amount AS double), 0e0
      FROM tokens_solana.sol_transfers s
      LEFT JOIN prices.usd_daily p ON p.day = date(s.block_time) AND p.blockchain = 'solana' AND p.symbol = 'SOL'
      WHERE TIME_RANGE AND s.action = 'transfer'
        AND s.from_owner IN (${refWallets}) AND (s.to_owner IS NULL OR s.to_owner NOT IN (${refInternal}))
        AND (p.price IS NULL OR s.amount / 1e9 * p.price < ${REFERRAL_MAX_USD})
      UNION ALL
      -- referral payouts in stablecoins (USDC/USDT/USD1 outflows), excluding single
      -- transfers >= $150k (stables ≈ $1, so raw/1e6 is the USD value).
      SELECT CAST(date(block_time) AS varchar), 0e0, 0e0, 0e0, CAST(amount AS double)
      FROM tokens_solana.transfers
      WHERE TIME_RANGE AND action = 'transfer'
        AND token_mint_address IN (${refStables})
        AND from_owner IN (${refWallets}) AND to_owner NOT IN (${refInternal})
        AND amount / 1e6 < ${REFERRAL_MAX_USD}
    ),
    sol AS (
      SELECT day, SUM(sol_raw) AS sol_raw, SUM(usdc_raw) AS usdc_raw,
             SUM(ref_sol_raw) AS ref_sol_raw, SUM(ref_stable_raw) AS ref_stable_raw
      FROM sol_parts GROUP BY day
    )
    SELECT day, chain, sol_raw, usdc_raw, usd, ref_sol_raw, ref_stable_raw FROM evm
    UNION ALL
    SELECT day, 'solana' AS chain, sol_raw, usdc_raw, CAST(NULL AS double) AS usd, ref_sol_raw, ref_stable_raw FROM sol
  `;
};

// Days up to 2026-06-25 are served from the precomputed full-history Dune results
// (https://dune.com/queries/7819191) so refills don't re-scan the chains; newer
// days run the live query above. Bump this (and re-run 7819191) to extend the cache.
const HISTORICAL_CUTOFF = 1782345600; // 2026-06-25 00:00 UTC
const HISTORY_QUERY_ID = '7819191';

// Runs ONCE per day for all chains: cached results for historical days (filtered
// to the day), otherwise one live multi-chain query. Each chain's fetch reads
// these rows from options.preFetchedResults.
const prefetch = async (options: FetchOptions) => {
  if (options.startOfDay <= HISTORICAL_CUTOFF) {
    return queryDuneResult(options, HISTORY_QUERY_ID, `day = '${options.dateString}'`);
  }
  return queryDuneSql(options, liveQuery());
};

const REFERRAL = 'Referral rewards';
const REFERRAL_EST = 'Referral rewards (estimated)';
// GMGN's referral payout wallets are only identifiable on Solana (EVM fees
// off-ramp to a Pionex CEX hot wallet, so EVM referral can't be isolated
// on-chain). EVM referral is therefore ESTIMATED by applying the measured Solana
// referral rate (referral_usd / fees_usd) to EVM fees. Rate = 16% = the 2025-2026
// blended Solana rate after excluding >=$150k spikes (referral $15.3M / fees
// $94.8M; from cached query 7819191, SOL-priced). Tune if the measured rate shifts.
const EVM_REFERRAL_RATE = 0.16;

const fetch: any = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const target = options.chain === CHAIN.SOLANA ? 'solana' : EVM_CHAINS[options.chain]?.dune;
  const rows: any[] = (options.preFetchedResults || []).filter((r: any) => r.chain === target);

  for (const row of rows) {
    if (options.chain === CHAIN.SOLANA) {
      const feeSol = Number(row.sol_raw) || 0, feeUsdc = Number(row.usdc_raw) || 0;
      const refSol = Number(row.ref_sol_raw) || 0, refStable = Number(row.ref_stable_raw) || 0;
      dailyFees.add(ADDRESSES.solana.SOL, feeSol, METRIC.TRADING_FEES);
      dailyFees.add(ADDRESSES.solana.USDC, feeUsdc, METRIC.TRADING_FEES);
      // Referral payouts (supply-side), netted from revenue. They are paid in a
      // different token mix than fees are collected, so revenue is reconciled in
      // USD across tokens (a per-token leg can go negative; allowNegativeValue).
      dailySupplySideRevenue.add(ADDRESSES.solana.SOL, refSol, REFERRAL);
      dailySupplySideRevenue.add(ADDRESSES.solana.USDC, refStable, REFERRAL);
      dailyRevenue.add(ADDRESSES.solana.SOL, feeSol - refSol, METRIC.TRADING_FEES);
      dailyRevenue.add(ADDRESSES.solana.USDC, feeUsdc - refStable, METRIC.TRADING_FEES);
    } else {
      // EVM: referral isn't isolable on-chain (off-ramps to a CEX), so it is
      // estimated at the measured Solana referral rate and netted from revenue.
      const usd = Number(row.usd) || 0;
      const referral = usd * EVM_REFERRAL_RATE;
      dailyFees.addUSDValue(usd, METRIC.TRADING_FEES);
      dailySupplySideRevenue.addUSDValue(referral, REFERRAL_EST);
      dailyRevenue.addUSDValue(usd - referral, METRIC.TRADING_FEES);
    }
  }

  return { dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue, dailySupplySideRevenue }
}

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  prefetch,
  adapter: chainConfig,
  isExpensiveAdapter: true,
  // Referral payouts are made in a different token mix than fees are collected
  // (e.g. referral USDC can exceed USDC fees), so a per-token revenue leg can be
  // negative while the USD total stays correct (Revenue = Fees − referral).
  allowNegativeValue: true,
  dependencies: [Dependencies.DUNE],
  methodology: {
    Fees: "All trading fees paid by users while using GMGN AI bot (1% per trade), collected in both the native gas token and USDC, tracked via Dune. Solana = native-SOL + USDC inflows to the fee wallets; EVM = native gas-token + USDC inflows to the fee collector.",
    Revenue: "Trading fees retained by GMGN after referral commissions. Solana referral is measured on-chain; EVM referral is estimated at the measured Solana referral rate (~16% of fees).",
    ProtocolRevenue: "Same as Revenue.",
    SupplySideRevenue: "Referral commissions GMGN pays to referrers. Solana = measured outflows (SOL + USDC/USDT/USD1) from its three referral-distribution wallets; EVM = estimated at the Solana referral rate since EVM fees off-ramp to a CEX and referral can't be isolated on-chain.",
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.TRADING_FEES]: "Fees paid by users while using GMGN bot.",
    },
    Revenue: {
      [METRIC.TRADING_FEES]: "Trading fees retained by GMGN after referral payouts.",
    },
    ProtocolRevenue: {
      [METRIC.TRADING_FEES]: "Trading fees retained by GMGN after referral payouts.",
    },
    SupplySideRevenue: {
      [REFERRAL]: "Referral commissions measured as outflows from GMGN's Solana referral wallets.",
      [REFERRAL_EST]: "EVM referral commissions, estimated at the measured Solana referral rate (EVM payouts off-ramp to a CEX and can't be isolated on-chain).",
    },
  },
};

export default adapter;
