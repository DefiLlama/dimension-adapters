import { Dependencies, FetchOptions, SimpleAdapter } from '../../adapters/types';
import { CHAIN } from '../../helpers/chains';
import { queryDuneSql } from '../../helpers/dune';

// Pairz platform registration, finalized 2026-09-07:
// https://solscan.io/tx/5W1AnfdEMHBAoYPkAeMMoPcsnh8VjzRjDzFeWjgzRoLdVuDPj1JG4cgS4ri3mJuoR4kzEgMzx78FxfVN9u2VV2Yb
const PLATFORM = '3om3BermKeuUVXEbtktzkiuPh4mY5fn1c8cNh1TR3DUj';
const labels = {
  platform: 'LaunchLab Platform Trading Fees',
  raydium: 'LaunchLab Trading Fees To Raydium',
  creator: 'LaunchLab Trading Fees To Coin Creators',
};

export const feeQuery = (options: Pick<FetchOptions, 'startTimestamp' | 'endTimestamp'>) => {
  if (!Number.isSafeInteger(options.startTimestamp) || !Number.isSafeInteger(options.endTimestamp)
    || options.startTimestamp < 0 || options.endTimestamp <= options.startTimestamp)
    throw new Error('Invalid Pairz query interval');
  return `
    WITH initializations AS (
      SELECT account_pool_state AS pool, account_quote_mint AS quote_mint
      FROM raydium_solana.raydium_launchpad_call_initialize
      WHERE account_platform_config = '${PLATFORM}' AND call_success
      UNION
      SELECT account_pool_state, account_quote_mint
      FROM raydium_solana.raydium_launchpad_call_initialize_v2
      WHERE account_platform_config = '${PLATFORM}' AND call_success
      UNION
      SELECT account_pool_state, account_quote_mint
      FROM raydium_solana.raydium_launchpad_call_initialize_with_token_2022
      WHERE account_platform_config = '${PLATFORM}' AND call_success
    ), pools AS (
      SELECT pool, MIN(quote_mint) AS quote_mint,
             COUNT(DISTINCT quote_mint) AS quote_count,
             COUNT_IF(quote_mint IS NULL) AS null_quotes
      FROM initializations GROUP BY pool
    ), migrations AS (
      SELECT COUNT(*) AS migration_count
      FROM raydium_solana.raydium_launchpad_call_migrate_to_cpswap
      WHERE account_platform_config = '${PLATFORM}' AND call_success
        AND call_block_time < from_unixtime(${options.endTimestamp})
    ), fees AS (
      SELECT p.quote_mint,
             CAST(SUM(CAST(t.platform_fee AS DECIMAL(38,0))) AS VARCHAR) AS platform_fee,
             CAST(SUM(CAST(t.protocol_fee AS DECIMAL(38,0))) AS VARCHAR) AS protocol_fee,
             CAST(SUM(CAST(t.creator_fee AS DECIMAL(38,0))) AS VARCHAR) AS creator_fee,
             COUNT(*) AS trade_count,
             COUNT_IF(t.platform_fee IS NULL OR t.protocol_fee IS NULL OR t.creator_fee IS NULL
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

export const aggregateFees = (options: Pick<FetchOptions, 'createBalances'>, rows: unknown) => {
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
    if (String(row.migration_count) !== '0')
      throw new Error('Pairz migrated pools require CPMM coverage before publishing totals');
    // A LEFT JOIN sentinel represents a successful query with no trades, not an API failure.
    if (row.quote_mint === null && row.invalid_rows === null && row.trade_count === null
      && row.platform_fee === null && row.protocol_fee === null && row.creator_fee === null) {
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
    dailyFees.add(row.quote_mint, platform, labels.platform);
    dailyFees.add(row.quote_mint, protocol, labels.raydium);
    dailyFees.add(row.quote_mint, creator, labels.creator);
    dailyRevenue.add(row.quote_mint, platform, labels.platform);
    dailySupplySideRevenue.add(row.quote_mint, protocol, labels.raydium);
    dailySupplySideRevenue.add(row.quote_mint, creator, labels.creator);
  }
  // Buyback allocations are not evidence of completed buybacks. Holder revenue
  // requires a separate verified settlement query; intentionally absent in this draft.
  return { dailyFees, dailyRevenue, dailySupplySideRevenue };
};

const fetch = async (options: FetchOptions) => aggregateFees(options, await queryDuneSql(options, feeQuery(options)));

const adapter: SimpleAdapter = {
  version: 1, // Dune is queried daily, per repository guidance.
  chains: [CHAIN.SOLANA],
  start: '2026-09-07',
  dependencies: [Dependencies.DUNE],
  fetch,
  // Raydium's protocol-fee component overlaps its LaunchLab listing.
  doublecounted: true,
  methodology: {
    Fees: 'Draft LaunchLab coverage: actual platform, Raydium protocol and coin-creator fees on pools initialized under the Pairz platform. Raw amounts are priced in each pool’s quote mint.',
    Revenue: 'Actual LaunchLab platform fees accrued to Pairz; excludes Raydium and coin-creator fees. Accrual is not evidence of a completed PAIRZ buyback.',
    SupplySideRevenue: 'Raydium protocol fees and coin-creator fees from the same trade events.',
  },
  breakdownMethodology: {
    Fees: {
      [labels.platform]: 'Actual platform_fee from Pairz LaunchLab trade events.',
      [labels.raydium]: 'Actual protocol_fee from Pairz LaunchLab trade events.',
      [labels.creator]: 'Actual creator_fee from Pairz LaunchLab trade events.',
    },
    Revenue: {
      [labels.platform]: 'Pairz platform fee accrual, before subsequent buyback execution.',
    },
    SupplySideRevenue: {
      [labels.raydium]: 'Fees owed to the underlying Raydium protocol.',
      [labels.creator]: 'Fees owed to individual coin creators.',
    },
  },
};
export default adapter;
