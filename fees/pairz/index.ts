import { Dependencies, FetchOptions, SimpleAdapter } from '../../adapters/types';
import { CHAIN } from '../../helpers/chains';
import { queryDuneSql } from '../../helpers/dune';
import { fetchCpmm, CPMM_LABELS } from './cpmm';

// Pairz platform registration, finalized 2026-09-07:
// https://solscan.io/tx/5W1AnfdEMHBAoYPkAeMMoPcsnh8VjzRjDzFeWjgzRoLdVuDPj1JG4cgS4ri3mJuoR4kzEgMzx78FxfVN9u2VV2Yb
const PLATFORM = '3om3BermKeuUVXEbtktzkiuPh4mY5fn1c8cNh1TR3DUj';
const labels = {
  platform: 'LaunchLab Platform Trading Fees',
  raydium: 'LaunchLab Trading Fees To Raydium',
  creator: 'LaunchLab Trading Fees To Coin Creators',
  referral: 'LaunchLab Trading Fees To Referrers',
};

export const feeQuery = (options: Pick<FetchOptions, 'startTimestamp' | 'endTimestamp'>) => {
  if (!Number.isSafeInteger(options.startTimestamp) || !Number.isSafeInteger(options.endTimestamp)
    || options.startTimestamp < 0 || options.endTimestamp <= options.startTimestamp)
    throw new Error('Invalid Pairz query interval');
  return `
    WITH initializations AS (
      SELECT account_pool_state AS pool, account_quote_mint AS quote_mint
      FROM raydium_solana.raydium_launchpad_call_initialize
      WHERE account_platform_config = '${PLATFORM}'
        AND call_block_time >= TIMESTAMP '2026-09-07 00:00:00 UTC'
        AND call_block_time < from_unixtime(${options.endTimestamp})
        AND EXISTS (
        SELECT 1 FROM solana.transactions tx
        WHERE tx.id = call_tx_id AND tx.success
          AND tx.block_time >= TIMESTAMP '2026-09-07 00:00:00 UTC'
          AND tx.block_time < from_unixtime(${options.endTimestamp})
      )
      UNION
      SELECT account_pool_state, account_quote_mint
      FROM raydium_solana.raydium_launchpad_call_initialize_v2
      WHERE account_platform_config = '${PLATFORM}'
        AND call_block_time >= TIMESTAMP '2026-09-07 00:00:00 UTC'
        AND call_block_time < from_unixtime(${options.endTimestamp})
        AND EXISTS (
        SELECT 1 FROM solana.transactions tx
        WHERE tx.id = call_tx_id AND tx.success
          AND tx.block_time >= TIMESTAMP '2026-09-07 00:00:00 UTC'
          AND tx.block_time < from_unixtime(${options.endTimestamp})
      )
      UNION
      SELECT account_pool_state, account_quote_mint
      FROM raydium_solana.raydium_launchpad_call_initialize_with_token_2022
      WHERE account_platform_config = '${PLATFORM}'
        AND call_block_time >= TIMESTAMP '2026-09-07 00:00:00 UTC'
        AND call_block_time < from_unixtime(${options.endTimestamp})
        AND EXISTS (
        SELECT 1 FROM solana.transactions tx
        WHERE tx.id = call_tx_id AND tx.success
          AND tx.block_time >= TIMESTAMP '2026-09-07 00:00:00 UTC'
          AND tx.block_time < from_unixtime(${options.endTimestamp})
      )
    ), pools AS (
      SELECT pool, MIN(quote_mint) AS quote_mint,
             COUNT(DISTINCT quote_mint) AS quote_count,
             COUNT_IF(quote_mint IS NULL) AS null_quotes
      FROM initializations GROUP BY pool
    ), migrations AS (
      SELECT COUNT(DISTINCT account_cpswap_pool) AS migration_count
      FROM raydium_solana.raydium_launchpad_call_migrate_to_cpswap
      WHERE account_platform_config = '${PLATFORM}'
        AND call_block_time >= TIMESTAMP '2026-09-07 00:00:00 UTC'
        AND call_block_time < from_unixtime(${options.endTimestamp})
        AND EXISTS (
        SELECT 1 FROM solana.transactions tx
        WHERE tx.id = call_tx_id AND tx.success
          AND tx.block_time >= TIMESTAMP '2026-09-07 00:00:00 UTC'
          AND tx.block_time < from_unixtime(${options.endTimestamp})
      )
    ), fees AS (
      SELECT p.quote_mint,
             CAST(SUM(CAST(t.platform_fee AS DECIMAL(38,0))) AS VARCHAR) AS platform_fee,
             CAST(SUM(CAST(t.protocol_fee AS DECIMAL(38,0))) AS VARCHAR) AS protocol_fee,
             CAST(SUM(CAST(t.creator_fee AS DECIMAL(38,0))) AS VARCHAR) AS creator_fee,
             CAST(SUM(CAST(t.share_fee AS DECIMAL(38,0))) AS VARCHAR) AS share_fee,
             COUNT(*) AS trade_count,
             COUNT_IF(t.platform_fee IS NULL OR t.protocol_fee IS NULL OR t.creator_fee IS NULL OR t.share_fee IS NULL
               OR p.quote_count <> 1 OR p.null_quotes > 0 OR p.quote_mint IS NULL) AS invalid_rows
      FROM raydium_solana.raydium_launchpad_evt_tradeevent t
      JOIN pools p ON t.pool_state = p.pool
      WHERE t.evt_block_time >= from_unixtime(${options.startTimestamp})
        AND t.evt_block_time < from_unixtime(${options.endTimestamp})
        AND EXISTS (
          SELECT 1 FROM solana.transactions tx
          WHERE tx.id = t.evt_tx_id AND tx.success AND TIME_RANGE
        )
      GROUP BY p.quote_mint
    )
    SELECT f.*, m.migration_count
    FROM migrations m LEFT JOIN fees f ON TRUE
  `;
};

export const aggregateFees = (options: Pick<FetchOptions, 'createBalances'>, rows: unknown, coveredMigrations = 0) => {
  if (!Array.isArray(rows) || !rows.length) throw new Error('Pairz query returned no coverage row');
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const raw = (value: unknown): string => {
    if (typeof value !== 'string' || !/^(0|[1-9]\d{0,37})$/.test(value)) throw new Error('Invalid Pairz raw fee amount');
    return value;
  };
  const mints = new Set<string>();
  for (const row of rows) {
    if (!row || typeof row !== 'object') throw new Error('Invalid Pairz query row');
    if (String(row.migration_count) !== String(coveredMigrations))
      throw new Error('Pairz migrated pools require CPMM coverage before publishing totals');
    // A LEFT JOIN sentinel represents a successful query with no trades, not an API failure.
    if (row.quote_mint === null && row.invalid_rows === null && row.trade_count === null
      && row.platform_fee === null && row.protocol_fee === null && row.creator_fee === null && row.share_fee === null) {
      if (rows.length !== 1) throw new Error('Mixed empty and nonempty Pairz rows');
      continue;
    }
    if (!/^[1-9]\d*$/.test(String(row.trade_count))) throw new Error('Missing Pairz trade coverage');
    if (String(row.invalid_rows) !== '0' || typeof row.quote_mint !== 'string'
      || !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(row.quote_mint))
      throw new Error('Incomplete Pairz fee or quote-mint decoding');
    if (mints.has(row.quote_mint)) throw new Error('Duplicate Pairz quote aggregate');
    mints.add(row.quote_mint);
    const platform = raw(row.platform_fee);
    const protocol = raw(row.protocol_fee);
    const creator = raw(row.creator_fee);
    const referral = raw(row.share_fee);
    dailyFees.add(row.quote_mint, platform, labels.platform);
    dailyFees.add(row.quote_mint, protocol, labels.raydium);
    dailyFees.add(row.quote_mint, creator, labels.creator);
    dailyFees.add(row.quote_mint, referral, labels.referral);
    dailyRevenue.add(row.quote_mint, platform, labels.platform);
    dailySupplySideRevenue.add(row.quote_mint, protocol, labels.raydium);
    dailySupplySideRevenue.add(row.quote_mint, creator, labels.creator);
    dailySupplySideRevenue.add(row.quote_mint, referral, labels.referral);
  }
  // Buyback allocations are not evidence of completed buybacks. Holder revenue
  // requires a separate verified settlement query; intentionally absent in this draft.
  return { dailyFees, dailyRevenue, dailySupplySideRevenue };
};

// The upstream runner's v1 startTimestamp includes the preceding second.
// Use the actual UTC day and pass the same bounds to Dune's TIME_RANGE macro.
export const dailyOptions = (options: FetchOptions): FetchOptions => ({
  ...options, startTimestamp: options.startOfDay, endTimestamp: options.startOfDay + 86400,
});
const fetch = async (options: FetchOptions) => {
  const daily = dailyOptions(options);
  const rows = await queryDuneSql(daily, feeQuery(daily));
  const count = rows?.[0]?.migration_count;
  if (!Number.isSafeInteger(count) || count < 0) throw new Error('Invalid migration count');
  const cpmm = count ? await fetchCpmm(daily, count) : null;
  const fees = aggregateFees(daily, rows, count);
  if (cpmm) {
    fees.dailyFees.addBalances(cpmm.dailyFees);
    fees.dailyRevenue.addBalances(cpmm.dailyRevenue);
    fees.dailySupplySideRevenue.addBalances(cpmm.dailySupplySideRevenue);
  }
  return fees;
};

const adapter: SimpleAdapter = {
  version: 1, // Dune is queried daily, per repository guidance.
  chains: [CHAIN.SOLANA],
  start: '2026-09-07',
  dependencies: [Dependencies.DUNE],
  fetch,
  // Raydium's protocol-fee component overlaps its LaunchLab listing.
  doublecounted: true,
  methodology: {
    Fees: 'Actual LaunchLab platform, Raydium, creator and referral fees, plus raw-event CPMM trading and creator fees on pools migrated from the Pairz platform. Each fee stays denominated in its actual mint.',
    Revenue: 'Actual LaunchLab platform and migrated CPMM creator fees accrued to Pairz; excludes Raydium and coin-creator fees. Accrual is not evidence of a completed PAIRZ buyback.',
    SupplySideRevenue: 'LaunchLab Raydium, coin-creator and referral fees, plus CPMM trade fees paid to Raydium and LPs; CPMM trade fees exclude the Pairz creator component.',
  },
  breakdownMethodology: {
    Fees: {
      [CPMM_LABELS.pairz]: 'Actual creator fees from successful migrated Pairz CPMM swap events.',
      [CPMM_LABELS.suppliers]: 'Actual CPMM trade fees; includes Raydium protocol/fund portions, counted once.',
      [labels.platform]: 'Actual platform_fee from Pairz LaunchLab trade events.',
      [labels.raydium]: 'Actual protocol_fee from Pairz LaunchLab trade events.',
      [labels.creator]: 'Actual creator_fee from Pairz LaunchLab trade events.',
      [labels.referral]: 'Actual share_fee from LaunchLab events; a separate component of the total trading fee.',
    },
    Revenue: {
      [CPMM_LABELS.pairz]: 'Quote-denominated CPMM creator fees attributable to migrated Pairz pools.',
      [labels.platform]: 'Pairz platform fee accrual, before subsequent buyback execution.',
    },
    SupplySideRevenue: {
      [CPMM_LABELS.suppliers]: 'The CPMM trade_fee component going to Raydium and LPs.',
      [labels.raydium]: 'Fees owed to the underlying Raydium protocol.',
      [labels.creator]: 'Fees owed to individual coin creators.',
      [labels.referral]: 'Trading fees owed to the swap referrer, not retained by Pairz.',
    },
  },
};
export default adapter;
