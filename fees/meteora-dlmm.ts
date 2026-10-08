import { Dependencies, FetchOptions, SimpleAdapter } from '../adapters/types';
import { CHAIN } from '../helpers/chains';
import { queryDuneSql } from '../helpers/dune';
import { METRIC } from '../helpers/metrics';

// Meteora DLMM fees and revenue. Volume is in dexs/meteora-dlmm.ts.
// Swap events give the gross fee and protocol_fee in the fee token; each fee is valued at swap time from the
// trade's USD value in dex_solana.trades (priced off the SOL/USDC side). Unpriced swaps fall back to raw amounts.

const DLMM_PROGRAM = 'LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo';

// Referral Staking (https://meteora.ag/referral, since 2026-07-21): 10% of DLMM protocol fees to MET stakers plus
// referrer (8%) / referred-LP (2%) rewards, paid in USDC via one merkle distributor per monthly cycle
// (Cycle 1 $262k funded 2026-09-10, Cycle 2 $703k funded 2026-09-23 from 5o9QjCUzXf7HkoiSe4DGaS1m5KBo3x6cmMEHRceFh96q).
// Counted when claimed, since the funding wallet/ATA changes per cycle; staker vs referrer split is not on-chain.
const MERKLE_DISTRIBUTOR_PROGRAM = 'DiSLRwcSFvtwvMWSs7ubBMvYRaYNYupa76ZSuYLe6D7j';
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
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
swaps AS (
  SELECT
    -- swap_for_y: X sold, Y bought; fee token is X or Y per fees_on_token_x
    CASE WHEN e.fees_on_token_x = e.swap_for_y THEN t.sold_mint ELSE t.bought_mint END AS fee_mint,
    CASE WHEN e.fees_on_token_x = e.swap_for_y THEN t.sold_raw ELSE t.bought_raw END AS fee_side_raw,
    t.amount_usd,
    e.gross_fee,
    e.protocol_fee
  FROM events e
  INNER JOIN trades t
    ON t.tx_id = e.tx_id
   AND t.outer_instruction_index = e.outer_instruction_index
   AND t.swap_number = e.swap_number
),
valued AS (
  SELECT
    fee_mint,
    amount_usd IS NULL OR fee_side_raw IS NULL OR fee_side_raw = 0 AS unpriced,
    gross_fee,
    protocol_fee,
    -- a fee cannot exceed the trade it was taken from
    least(CAST(gross_fee AS DOUBLE) * amount_usd / fee_side_raw, amount_usd) AS fee_usd,
    least(CAST(protocol_fee AS DOUBLE) * amount_usd / fee_side_raw, amount_usd) AS protocol_usd
  FROM swaps
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
SELECT CAST(coalesce(sum(amount), 0) AS VARCHAR) AS usdc_raw
FROM tokens_solana.transfers
WHERE block_date >= CAST(from_unixtime(${options.startTimestamp}) AS DATE)
  AND block_date <= CAST(from_unixtime(${options.endTimestamp} - 1) AS DATE)
  AND block_time >= from_unixtime(${options.startTimestamp})
  AND block_time < from_unixtime(${options.endTimestamp})
  AND token_mint_address = '${USDC_MINT}'
  AND outer_executing_account = '${MERKLE_DISTRIBUTOR_PROGRAM}'
`;

const fetch = async (options: FetchOptions) => {
  const rows: FeeRow[] = await queryDuneSql(options, getFeesQuery(options), { extraUIDKey: 'dlmm-fees' });
  if (!rows.length) throw new Error('meteora-dlmm fees: Dune returned no swaps for the window');

  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances(); // protocol share of swap fees
  const dailySupplySideRevenue = options.createBalances();

  let swaps = 0;
  let unpriced = 0;
  for (const row of rows) {
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
    const [claims] = await queryDuneSql(options, getReferralStakingClaimsQuery(options), { extraUIDKey: 'referral-staking-claims' });
    dailyHoldersRevenue.add(USDC_MINT, claims.usdc_raw, REFERRAL_STAKING_REWARDS);
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
  Fees: 'Swap fees paid by traders in DLMM pools, valued at the time of each swap.',
  UserFees: 'Swap fees paid by traders in DLMM pools, valued at the time of each swap.',
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
