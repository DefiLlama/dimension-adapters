import ADDRESSES from '../helpers/coreAssets.json'
import { Dependencies, FetchOptions, SimpleAdapter } from '../adapters/types';
import { CHAIN } from '../helpers/chains';
import { queryDuneSql } from '../helpers/dune';
import { assertDuneSolanaIndexed } from '../helpers/duneSolanaDex';
import { METRIC } from '../helpers/metrics';

// Meteora DLMM fees and revenue. Volume is in dexs/meteora-dlmm.ts.
// Swap events give the gross fee and protocol_fee in the fee token; each fee is valued at swap time from the
// trade's USD value in dex_solana.trades (priced off the SOL/USDC side). Unpriced swaps fall back to raw amounts.
// Each swap's fee token comes from its pool's mints in the call tables. Exact-out and price-impact swaps have no
// dex_solana.trades row since 2026-05-13 (see dexs/meteora-dlmm.ts): those, and swaps paired with another pool's
// trade row, are valued at the pool's average price that day.

const DLMM_PROGRAM = 'LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo';
const NO_TRADE_ROW_CALLS = ['swap_exact_out', 'swap_exact_out2', 'swap_with_price_impact', 'swap_with_price_impact2'];

// Referral Staking (https://meteora.ag/referral, since 2026-07-21): 10% of DLMM protocol fees to MET stakers plus
// referrer (8%) / referred-LP (2%) rewards, paid in USDC via one merkle distributor per monthly cycle
// (Cycle 1 $262k funded 2026-09-10, Cycle 2 $703k funded 2026-09-23 from 5o9QjCUzXf7HkoiSe4DGaS1m5KBo3x6cmMEHRceFh96q).
// Counted when claimed. All claims are holders revenue: referral rewards only go to wallets that stake MET
// themselves (200 MET minimum), and the split is not on-chain anyway.
// The distributor program is a shared deployment (same upgrade authority as Jupiter's), so claims are scoped to
// the cycle distributor accounts; a new cycle adds one entry here. All cycles share the distributor admin
// B2tKdjH11kLTqEJAzN8qGfVXmLnwgbxWgjAkXr2ehUgN and clawback receiver KVdHwixX5cSyhcrx3Lti7oYHwAxBgwNY7FrkX1oT2Hy.
const MERKLE_DISTRIBUTOR_PROGRAM = 'DiSLRwcSFvtwvMWSs7ubBMvYRaYNYupa76ZSuYLe6D7j';
const REFERRAL_STAKING_DISTRIBUTORS = [
  'F8V2kory4zDQ7a1eRp4PEiuXeqC94hbHqcekHDwpdYrz', // cycle 1 (2026-07-21 to 2026-08-21), funded 2026-09-10
  'ETZXpSBB22C3vTt923c31rNYweVd3LAnkjEmgQwZQAw5', // cycle 2 (2026-08-21 to 2026-09-21), funded 2026-09-23
  'BBZ2yjFEePF6fxtwX2qwLmqS7FodZHjR5WScrWgLh9p9',
];
// USDC paid out by an unlisted distributor above this is either a new cycle (add it) or another project's drop
const UNLISTED_DISTRIBUTOR_ALERT_USDC = 1_000;
const USDC_MINT = ADDRESSES.solana.USDC;
const REFERRAL_STAKING_CLAIMS_START = '2026-09-10'; // first cycle became claimable
const REFERRAL_STAKING_REWARDS = 'Referral Staking Rewards';

type FeeRow = {
  fee_mint: string;
  n_swaps: string;
  n_unpriced: string;
  priced_fee_usd: string;
  priced_protocol_usd: string;
  unpriced_fee_raw: string;
  unpriced_protocol_raw: string;
};

const getFeesQuery = (options: FetchOptions) => `
WITH
events_raw AS (
  -- legacy Swap event: fee on the input token; amountIn IS NOT NULL drops empty rows duplicated by Swap2Evt
  SELECT
    evt_tx_id AS tx_id,
    coalesce(evt_outer_instruction_index, 0) AS outer_instruction_index,
    coalesce(evt_inner_instruction_index, 0) AS inner_instruction_index,
    "lbPair" AS pool,
    CAST("fee" AS DECIMAL(38, 0)) AS gross_fee,
    CAST("protocolFee" AS DECIMAL(38, 0)) AS protocol_fee,
    "swapForY" AS swap_for_y,
    "swapForY" AS fees_on_token_x
  FROM dlmm_solana.lb_clmm_evt_swap
  WHERE evt_block_date >= CAST(from_unixtime(${options.startTimestamp}) AS DATE)
    AND evt_block_date <= CAST(from_unixtime(${options.endTimestamp} - 1) AS DATE)
    AND evt_block_time >= from_unixtime(${options.startTimestamp})
    AND evt_block_time < from_unixtime(${options.endTimestamp})
    AND evt_inner_executing_account = '${DLMM_PROGRAM}'
    AND "amountIn" IS NOT NULL

  UNION ALL

  -- Swap2Evt: fee split per destination; protocol_fee is Meteora's share after the host fee
  SELECT
    evt_tx_id,
    coalesce(evt_outer_instruction_index, 0),
    coalesce(evt_inner_instruction_index, 0),
    lb_pair,
    CAST(mm_fee AS DECIMAL(38, 0))
      + CAST(protocol_fee AS DECIMAL(38, 0))
      + CAST(limit_order_fee AS DECIMAL(38, 0))
      + CAST(host_fee AS DECIMAL(38, 0)),
    CAST(protocol_fee AS DECIMAL(38, 0)),
    swap_for_y,
    fees_on_token_x
  FROM dlmm_solana.lb_clmm_evt_swap2evt
  WHERE evt_block_date >= CAST(from_unixtime(${options.startTimestamp}) AS DATE)
    AND evt_block_date <= CAST(from_unixtime(${options.endTimestamp} - 1) AS DATE)
    AND evt_block_time >= from_unixtime(${options.startTimestamp})
    AND evt_block_time < from_unixtime(${options.endTimestamp})
    AND evt_inner_executing_account = '${DLMM_PROGRAM}'
),
events AS (
  SELECT *,
    row_number() OVER (PARTITION BY tx_id, outer_instruction_index ORDER BY inner_instruction_index) AS swap_number
  FROM events_raw
),
trades AS (
  -- one row per DLMM swap instruction with its USD value
  SELECT
    tx_id,
    outer_instruction_index,
    project_program_id AS pool,
    amount_usd,
    CAST(token_sold_amount_raw AS DOUBLE) AS sold_raw,
    CAST(token_bought_amount_raw AS DOUBLE) AS bought_raw,
    token_sold_mint_address AS sold_mint,
    token_bought_mint_address AS bought_mint,
    row_number() OVER (PARTITION BY tx_id, outer_instruction_index ORDER BY inner_instruction_index) AS swap_number
  FROM dex_solana.trades
  WHERE block_month >= CAST(date_trunc('month', from_unixtime(${options.startTimestamp})) AS DATE)
    AND block_month <= CAST(date_trunc('month', from_unixtime(${options.endTimestamp} - 1)) AS DATE)
    AND block_time >= from_unixtime(${options.startTimestamp})
    AND block_time < from_unixtime(${options.endTimestamp})
    AND project = 'meteora'
    AND version = 2
),
pool_prices AS (
  -- USD per raw unit of each pool token, from the pool's counted trades of the window
  SELECT pool, mint, sum(amount_usd) / sum(raw) AS usd_per_raw
  FROM (
    SELECT pool, sold_mint AS mint, amount_usd, sold_raw AS raw FROM trades
    UNION ALL
    SELECT pool, bought_mint, amount_usd, bought_raw FROM trades
  )
  WHERE amount_usd > 0 AND raw > 0
  GROUP BY 1, 2
),
pool_mints AS (
  -- decoded call tables hold successful transactions only; swap and swap2 rows from before Dune's snake_case
  -- rename fill only the camelCase account columns
  SELECT DISTINCT account_lb_pair AS pool, account_token_x_mint AS token_x, account_token_y_mint AS token_y
  FROM (
${[...NO_TRADE_ROW_CALLS, 'swap', 'swap2'].map((call) => `    SELECT ${NO_TRADE_ROW_CALLS.includes(call)
      ? 'account_lb_pair, account_token_x_mint, account_token_y_mint'
      : 'coalesce(account_lb_pair, "account_lbPair"), coalesce(account_token_x_mint, "account_tokenXMint"), coalesce(account_token_y_mint, "account_tokenYMint")'}
    FROM dlmm_solana.lb_clmm_call_${call}
    WHERE call_block_date >= CAST(from_unixtime(${options.startTimestamp}) AS DATE)
      AND call_block_date <= CAST(from_unixtime(${options.endTimestamp} - 1) AS DATE)
      AND call_block_time >= from_unixtime(${options.startTimestamp})
      AND call_block_time < from_unixtime(${options.endTimestamp})`).join('\n    UNION ALL\n')}
  )
),
swaps AS (
  SELECT
    -- swap_for_y: X sold, Y bought; fee token is X or Y per fees_on_token_x
    CASE WHEN t.pool = e.pool THEN (CASE WHEN e.fees_on_token_x = e.swap_for_y THEN t.sold_mint ELSE t.bought_mint END) WHEN e.fees_on_token_x THEN m.token_x ELSE m.token_y END AS fee_mint,
    CASE WHEN e.fees_on_token_x = e.swap_for_y THEN t.sold_raw ELSE t.bought_raw END AS fee_side_raw,
    t.amount_usd,
    -- no trade row, or the row paired with it (numbered within the outer instruction, as Spellbook does) is another pool's
    t.tx_id IS NULL OR t.pool <> e.pool AS no_trade_row,
    e.pool,
    e.gross_fee,
    e.protocol_fee
  FROM events e
  LEFT JOIN trades t
    ON t.tx_id = e.tx_id
   AND t.outer_instruction_index = e.outer_instruction_index
   AND t.swap_number = e.swap_number
  LEFT JOIN pool_mints m ON m.pool = e.pool
),
valued AS (
  SELECT
    s.fee_mint,
    s.gross_fee,
    s.protocol_fee,
    CAST(s.gross_fee AS DOUBLE) * s.usd_per_raw AS fee_usd,
    CAST(s.protocol_fee AS DOUBLE) * s.usd_per_raw AS protocol_usd,
    -- no price, or a fee worth more than its own swap (mismatched row): price the raw amount instead
    s.usd_per_raw IS NULL
      OR (NOT s.no_trade_row AND (s.fee_side_raw IS NULL OR s.fee_side_raw = 0
        OR CAST(s.gross_fee AS DOUBLE) * s.usd_per_raw > s.amount_usd)) AS unpriced
  FROM (
    SELECT
      -- a swap without a trade row of its own is valued at the pool's average price of its fee token that day
      CASE WHEN no_trade_row THEN p.usd_per_raw ELSE amount_usd / fee_side_raw END AS usd_per_raw,
      swaps.*
    FROM swaps
    LEFT JOIN pool_prices p
      ON swaps.no_trade_row
     AND p.pool = swaps.pool
     AND p.mint = swaps.fee_mint
  ) s
)
SELECT
  fee_mint,
  CAST(count(*) AS VARCHAR) AS n_swaps,
  CAST(count_if(unpriced) AS VARCHAR) AS n_unpriced,
  CAST(coalesce(sum(CASE WHEN NOT unpriced THEN fee_usd END), 0) AS VARCHAR) AS priced_fee_usd,
  CAST(coalesce(sum(CASE WHEN NOT unpriced THEN protocol_usd END), 0) AS VARCHAR) AS priced_protocol_usd,
  CAST(coalesce(sum(CASE WHEN unpriced THEN gross_fee END), 0) AS VARCHAR) AS unpriced_fee_raw,
  CAST(coalesce(sum(CASE WHEN unpriced THEN protocol_fee END), 0) AS VARCHAR) AS unpriced_protocol_raw
FROM valued
GROUP BY fee_mint
`;

const getReferralStakingClaimsQuery = (options: FetchOptions) => `
SELECT from_owner AS distributor, CAST(sum(amount) AS VARCHAR) AS usdc_raw
FROM tokens_solana.transfers
WHERE block_date >= CAST(from_unixtime(${options.startTimestamp}) AS DATE)
  AND block_date <= CAST(from_unixtime(${options.endTimestamp} - 1) AS DATE)
  AND block_time >= from_unixtime(${options.startTimestamp})
  AND block_time < from_unixtime(${options.endTimestamp})
  AND token_mint_address = '${USDC_MINT}'
  AND outer_executing_account = '${MERKLE_DISTRIBUTOR_PROGRAM}'
GROUP BY 1
`;

const fetch = async (options: FetchOptions) => {
  assertDuneSolanaIndexed(options);

  const rows: FeeRow[] = await queryDuneSql(options, getFeesQuery(options), { extraUIDKey: 'dlmm-fees' });
  if (!rows.length) throw new Error('meteora-dlmm fees: Dune returned no swaps for the window');

  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances(); // protocol share of swap fees
  const dailySupplySideRevenue = options.createBalances();

  let swaps = 0;
  let unpriced = 0;
  for (const row of rows) {
    if (!row.fee_mint) throw new Error(`meteora-dlmm fees: ${row.n_swaps} swap(s) with no trade row and no ${NO_TRADE_ROW_CALLS.join('/')} call to read the fee token from`);
    swaps += Number(row.n_swaps);
    unpriced += Number(row.n_unpriced);

    const feeUsd = Number(row.priced_fee_usd);
    const protocolUsd = Number(row.priced_protocol_usd);
    dailyFees.addUSDValue(feeUsd, METRIC.SWAP_FEES);
    dailyRevenue.addUSDValue(protocolUsd, METRIC.PROTOCOL_FEES);
    dailySupplySideRevenue.addUSDValue(feeUsd - protocolUsd, METRIC.LP_FEES);

    // unpriced swaps: raw fee amounts, priced by DefiLlama
    const unpricedFee = BigInt(row.unpriced_fee_raw);
    const unpricedProtocol = BigInt(row.unpriced_protocol_raw);
    dailyFees.add(row.fee_mint, unpricedFee, METRIC.SWAP_FEES);
    dailyRevenue.add(row.fee_mint, unpricedProtocol, METRIC.PROTOCOL_FEES);
    dailySupplySideRevenue.add(row.fee_mint, unpricedFee - unpricedProtocol, METRIC.LP_FEES);
  }
  options.api.log(`meteora-dlmm fees: ${swaps} swaps, ${unpriced} without a Dune trade price (DefiLlama-priced instead)`);

  // Referral Staking USDC claims; a day without claims is a real 0
  const dailyHoldersRevenue = options.createBalances();
  if (options.dateString >= REFERRAL_STAKING_CLAIMS_START) {
    const claims: { distributor: string; usdc_raw: string }[] = await queryDuneSql(options, getReferralStakingClaimsQuery(options), { extraUIDKey: 'referral-staking-claims' });
    const unlisted = claims.filter((c) => !REFERRAL_STAKING_DISTRIBUTORS.includes(c.distributor));
    const unlistedUsdc = unlisted.reduce((sum, c) => sum + Number(c.usdc_raw) / 1e6, 0);
    if (unlistedUsdc > UNLISTED_DISTRIBUTOR_ALERT_USDC)
      throw new Error(`meteora-dlmm: ${unlistedUsdc.toFixed(0)} USDC claimed from unlisted distributor(s) ${unlisted.map((c) => c.distributor).join(', ')}`);
    for (const c of claims)
      if (REFERRAL_STAKING_DISTRIBUTORS.includes(c.distributor)) dailyHoldersRevenue.add(USDC_MINT, c.usdc_raw, REFERRAL_STAKING_REWARDS);
  }

  // staking rewards are paid out of the protocol share: ProtocolRevenue = Revenue - HoldersRevenue
  const dailyProtocolRevenue = dailyRevenue.clone();
  dailyProtocolRevenue.subtract(dailyHoldersRevenue, METRIC.PROTOCOL_FEES);

  return {
    dailyFees,
    dailyUserFees: dailyFees.clone(),
    dailyRevenue,
    dailyProtocolRevenue,
    dailyHoldersRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Fees: 'Swap fees paid by traders in DLMM pools, valued at the time of each swap. Exact-out and price-impact swaps, which have no decoded trade row, are valued at the average price of the same pool that day.',
  UserFees: 'Swap fees paid by traders in DLMM pools, valued at the time of each swap. Exact-out and price-impact swaps, which have no decoded trade row, are valued at the average price of the same pool that day.',
  Revenue: 'Protocol share of swap fees, after host fees.',
  ProtocolRevenue: 'Protocol share of swap fees, minus the USDC staking rewards claimed that day.',
  HoldersRevenue: 'USDC rewards claimed by MET stakers and referrers under Referral Staking, paid out of DLMM protocol fees (claimable since 10 September 2026).',
  SupplySideRevenue: 'Swap fees paid to liquidity providers, limit-order owners and swap hosts.',
};

const adapter: SimpleAdapter = {
  version: 1,
  methodology,
  fetch,
  chains: [CHAIN.SOLANA],
  start: '2023-11-07',
  dependencies: [Dependencies.DUNE],
  isExpensiveAdapter: true,
  // most of a cycle is claimed the day the distributor opens ($433k on 2026-09-23), exceeding that day's protocol fees
  allowNegativeValue: true,
  breakdownMethodology: {
    Fees: { [METRIC.SWAP_FEES]: 'Swap fees paid by traders.' },
    UserFees: { [METRIC.SWAP_FEES]: 'Swap fees paid by traders.' },
    Revenue: { [METRIC.PROTOCOL_FEES]: 'Protocol share of swap fees.' },
    ProtocolRevenue: { [METRIC.PROTOCOL_FEES]: 'Protocol share of swap fees, net of USDC staking rewards claimed that day.' },
    HoldersRevenue: { [REFERRAL_STAKING_REWARDS]: 'USDC rewards claimed by MET stakers and referrers.' },
    SupplySideRevenue: { [METRIC.LP_FEES]: 'Swap fees paid to liquidity providers, limit-order owners and swap hosts.' },
  },
};

export default adapter;
