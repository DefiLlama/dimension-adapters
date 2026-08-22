import { Dependencies, FetchOptions, SimpleAdapter } from '../adapters/types';
import { CHAIN } from '../helpers/chains';
import { queryDuneSql } from '../helpers/dune';
import { METRIC } from '../helpers/metrics';

type DuneRow = {
  pool: string;
  mint: string;
  daily_volume: string;
  daily_fees: string;
  daily_protocol_revenue: string;
  daily_supply_side_revenue: string;
  reserve_balance: string;
};

type PoolData = {
  rows: DuneRow[];
};

const MIN_TVL_USD = 1_000_000;
const MAX_VOLUME_TO_TVL = 10;
// DLMM caps the total swap fee at 10%; 10.5% leaves rounding headroom.
const MAX_FEE_RATE = 0.105;

const getQuery = (options: FetchOptions) => `
WITH
calls_raw AS (
  SELECT
    call_block_time AS block_time,
    call_tx_id AS tx_id,
    coalesce(call_outer_instruction_index, 0) AS outer_instruction_index,
    coalesce(call_inner_instruction_index, 0) AS inner_instruction_index,
    coalesce(account_tokenXMint, account_token_x_mint) AS token_x_mint,
    coalesce(account_tokenYMint, account_token_y_mint) AS token_y_mint,
    coalesce(account_reserveX, account_reserve_x) AS reserve_x,
    coalesce(account_reserveY, account_reserve_y) AS reserve_y,
    coalesce(account_lbPair, account_lb_pair) AS pool
  FROM dlmm_solana.lb_clmm_call_swap
  WHERE call_block_time >= from_unixtime(${options.startTimestamp})
    AND call_block_time < from_unixtime(${options.endTimestamp})

  UNION ALL

  SELECT
    call_block_time,
    call_tx_id,
    coalesce(call_outer_instruction_index, 0),
    coalesce(call_inner_instruction_index, 0),
    coalesce(account_tokenXMint, account_token_x_mint),
    coalesce(account_tokenYMint, account_token_y_mint),
    coalesce(account_reserveX, account_reserve_x),
    coalesce(account_reserveY, account_reserve_y),
    coalesce(account_lbPair, account_lb_pair)
  FROM dlmm_solana.lb_clmm_call_swap2
  WHERE call_block_time >= from_unixtime(${options.startTimestamp})
    AND call_block_time < from_unixtime(${options.endTimestamp})

  UNION ALL

  SELECT call_block_time, call_tx_id, coalesce(call_outer_instruction_index, 0), coalesce(call_inner_instruction_index, 0),
    account_tokenXMint, account_tokenYMint, account_reserveX, account_reserveY, account_lbPair
  FROM dlmm_solana.lb_clmm_call_swapexactout
  WHERE call_block_time >= from_unixtime(${options.startTimestamp}) AND call_block_time < from_unixtime(${options.endTimestamp})

  UNION ALL

  SELECT call_block_time, call_tx_id, coalesce(call_outer_instruction_index, 0), coalesce(call_inner_instruction_index, 0),
    account_tokenXMint, account_tokenYMint, account_reserveX, account_reserveY, account_lbPair
  FROM dlmm_solana.lb_clmm_call_swapexactout2
  WHERE call_block_time >= from_unixtime(${options.startTimestamp}) AND call_block_time < from_unixtime(${options.endTimestamp})

  UNION ALL

  SELECT call_block_time, call_tx_id, coalesce(call_outer_instruction_index, 0), coalesce(call_inner_instruction_index, 0),
    account_tokenXMint, account_tokenYMint, account_reserveX, account_reserveY, account_lbPair
  FROM dlmm_solana.lb_clmm_call_swapwithpriceimpact
  WHERE call_block_time >= from_unixtime(${options.startTimestamp}) AND call_block_time < from_unixtime(${options.endTimestamp})

  UNION ALL

  SELECT call_block_time, call_tx_id, coalesce(call_outer_instruction_index, 0), coalesce(call_inner_instruction_index, 0),
    account_tokenXMint, account_tokenYMint, account_reserveX, account_reserveY, account_lbPair
  FROM dlmm_solana.lb_clmm_call_swapwithpriceimpact2
  WHERE call_block_time >= from_unixtime(${options.startTimestamp}) AND call_block_time < from_unixtime(${options.endTimestamp})

  UNION ALL

  SELECT call_block_time, call_tx_id, coalesce(call_outer_instruction_index, 0), coalesce(call_inner_instruction_index, 0),
    account_token_x_mint, account_token_y_mint, account_reserve_x, account_reserve_y, account_lb_pair
  FROM dlmm_solana.lb_clmm_call_swap_exact_out
  WHERE call_block_time >= from_unixtime(${options.startTimestamp}) AND call_block_time < from_unixtime(${options.endTimestamp})

  UNION ALL

  SELECT call_block_time, call_tx_id, coalesce(call_outer_instruction_index, 0), coalesce(call_inner_instruction_index, 0),
    account_token_x_mint, account_token_y_mint, account_reserve_x, account_reserve_y, account_lb_pair
  FROM dlmm_solana.lb_clmm_call_swap_exact_out2
  WHERE call_block_time >= from_unixtime(${options.startTimestamp}) AND call_block_time < from_unixtime(${options.endTimestamp})

  UNION ALL

  SELECT call_block_time, call_tx_id, coalesce(call_outer_instruction_index, 0), coalesce(call_inner_instruction_index, 0),
    account_token_x_mint, account_token_y_mint, account_reserve_x, account_reserve_y, account_lb_pair
  FROM dlmm_solana.lb_clmm_call_swap_with_price_impact
  WHERE call_block_time >= from_unixtime(${options.startTimestamp}) AND call_block_time < from_unixtime(${options.endTimestamp})

  UNION ALL

  SELECT call_block_time, call_tx_id, coalesce(call_outer_instruction_index, 0), coalesce(call_inner_instruction_index, 0),
    account_token_x_mint, account_token_y_mint, account_reserve_x, account_reserve_y, account_lb_pair
  FROM dlmm_solana.lb_clmm_call_swap_with_price_impact2
  WHERE call_block_time >= from_unixtime(${options.startTimestamp}) AND call_block_time < from_unixtime(${options.endTimestamp})
),
calls AS (
  SELECT
    *,
    row_number() OVER (
      PARTITION BY tx_id, outer_instruction_index
      ORDER BY inner_instruction_index
    ) AS swap_number
  FROM calls_raw
),
events_raw AS (
  -- amountIn excludes empty legacy rows duplicated by Swap2Evt.
  SELECT
    evt_tx_id AS tx_id,
    evt_block_time AS block_time,
    coalesce(evt_outer_instruction_index, 0) AS outer_instruction_index,
    coalesce(evt_inner_instruction_index, 0) AS inner_instruction_index,
    CAST("fee" AS DECIMAL(38, 0)) AS gross_fee,
    CAST("protocolFee" AS DECIMAL(38, 0)) AS protocol_fee,
    CAST("fee" - "protocolFee" AS DECIMAL(38, 0)) AS supply_side_fee,
    CAST("amountIn" AS DECIMAL(38, 0)) AS volume_raw,
    "swapForY" AS swap_for_y,
    "swapForY" AS fees_on_token_x
  FROM dlmm_solana.lb_clmm_evt_swap
  WHERE evt_block_time >= from_unixtime(${options.startTimestamp})
    AND evt_block_time < from_unixtime(${options.endTimestamp})
    AND evt_inner_executing_account = 'LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo'
    AND "amountIn" IS NOT NULL

  UNION ALL

  -- Swap2Evt records each fee destination separately.
  SELECT
    evt_tx_id,
    evt_block_time,
    coalesce(evt_outer_instruction_index, 0),
    coalesce(evt_inner_instruction_index, 0),
    CAST(mm_fee AS DECIMAL(38, 0))
      + CAST(protocol_fee AS DECIMAL(38, 0))
      + CAST(limit_order_fee AS DECIMAL(38, 0))
      + CAST(host_fee AS DECIMAL(38, 0)),
    CAST(protocol_fee AS DECIMAL(38, 0)),
    CAST(mm_fee AS DECIMAL(38, 0))
      + CAST(limit_order_fee AS DECIMAL(38, 0))
      + CAST(host_fee AS DECIMAL(38, 0)),
    CAST(amount_in AS DECIMAL(38, 0)),
    swap_for_y,
    fees_on_token_x
  FROM dlmm_solana.lb_clmm_evt_swap2evt
  WHERE evt_block_time >= from_unixtime(${options.startTimestamp})
    AND evt_block_time < from_unixtime(${options.endTimestamp})
    AND evt_inner_executing_account = 'LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo'
),
events AS (
  SELECT
    *,
    row_number() OVER (
      PARTITION BY tx_id, outer_instruction_index
      ORDER BY inner_instruction_index
    ) AS swap_number
  FROM events_raw
),
swaps AS (
  SELECT
    c.pool,
    CASE WHEN e.swap_for_y THEN c.token_x_mint ELSE c.token_y_mint END AS volume_mint,
    e.volume_raw,
    CASE WHEN e.fees_on_token_x THEN c.token_x_mint ELSE c.token_y_mint END AS fee_mint,
    e.gross_fee,
    e.protocol_fee,
    e.supply_side_fee,
    c.token_x_mint,
    c.token_y_mint,
    c.reserve_x,
    c.reserve_y
  FROM calls c
  INNER JOIN events e
    ON c.tx_id = e.tx_id
   AND c.block_time = e.block_time
   AND c.outer_instruction_index = e.outer_instruction_index
   AND c.swap_number = e.swap_number
),
metric_rows AS (
  SELECT
    pool,
    volume_mint AS mint,
    volume_raw,
    CAST(0 AS DECIMAL(38, 0)) AS gross_fee,
    CAST(0 AS DECIMAL(38, 0)) AS protocol_fee,
    CAST(0 AS DECIMAL(38, 0)) AS supply_side_fee
  FROM swaps

  UNION ALL

  SELECT
    pool,
    fee_mint,
    CAST(0 AS DECIMAL(38, 0)),
    gross_fee,
    protocol_fee,
    supply_side_fee
  FROM swaps
),
pool_metrics AS (
  SELECT
    pool,
    mint,
    sum(volume_raw) AS volume_raw,
    sum(gross_fee) AS gross_fee_raw,
    sum(protocol_fee) AS protocol_fee_raw,
    sum(supply_side_fee) AS supply_side_fee_raw
  FROM metric_rows
  GROUP BY pool, mint
),
pool_vaults AS (
  SELECT DISTINCT pool, reserve_x AS vault, token_x_mint AS mint FROM swaps
  UNION
  SELECT DISTINCT pool, reserve_y AS vault, token_y_mint AS mint FROM swaps
),
snapshot_day AS (
  -- daily_balances lags chain head by a few days. Pinning the join to the window's
  -- own date finds no rows on a recent run, every reserve reads 0, and the low-TVL
  -- filter below then drops every pool with volume. Use the newest snapshot that is
  -- not in the future instead: reserves move slowly enough for a wash-trade check.
  SELECT max(day) AS day
  FROM solana_utils.daily_balances
  WHERE day <= CAST(from_unixtime(${options.endTimestamp} - 1) AS DATE)
),
pool_reserves AS (
  SELECT
    v.pool,
    v.mint,
    sum(coalesce(b.token_balance, 0)) AS reserve_balance
  FROM pool_vaults v
  LEFT JOIN solana_utils.daily_balances b
    ON b.day = (SELECT day FROM snapshot_day)
   AND b.address = v.vault
   AND b.token_mint_address = v.mint
  GROUP BY v.pool, v.mint
),
pool_mints AS (
  SELECT pool, mint FROM pool_metrics
  UNION
  SELECT pool, mint FROM pool_reserves
)
SELECT
  pm.pool,
  pm.mint,
  CAST(coalesce(m.volume_raw, 0) AS VARCHAR) AS daily_volume,
  CAST(coalesce(m.gross_fee_raw, 0) AS VARCHAR) AS daily_fees,
  CAST(coalesce(m.protocol_fee_raw, 0) AS VARCHAR) AS daily_protocol_revenue,
  CAST(coalesce(m.supply_side_fee_raw, 0) AS VARCHAR) AS daily_supply_side_revenue,
  CAST(coalesce(r.reserve_balance, 0) AS VARCHAR) AS reserve_balance
FROM pool_mints pm
LEFT JOIN pool_metrics m
  ON m.pool = pm.pool
 AND m.mint = pm.mint
LEFT JOIN pool_reserves r
  ON r.pool = pm.pool
 AND r.mint = pm.mint
`;

const fetch = async (options: FetchOptions) => {
  const rows: DuneRow[] = await queryDuneSql(options, getQuery(options));

  const pricingBalances = options.createBalances();
  const pools = new Map<string, PoolData>();
  const mints = new Set<string>();

  for (const row of rows) {
    mints.add(row.mint);

    let pool = pools.get(row.pool);
    if (!pool) {
      pool = { rows: [] };
      pools.set(row.pool, pool);
    }

    pool.rows.push(row);
  }

  for (const mint of mints) pricingBalances.add(mint, '1');

  const { debugData } = await pricingBalances.getUSDJSONs({
    debug: true,
    debugOptions: { printTokenTable: false, minTokenUSDValue: 0 },
  });
  const prices = new Map(
    (debugData?.tokenData ?? []).map(({ token, price, decimals }) => [
      token.replace(/^solana:/, ''),
      { price, decimals },
    ]),
  );

  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  let lowTvlHighVolumePools = 0;
  let excessiveFeeRatePools = 0;

  for (const pool of pools.values()) {
    const { volumeUsd, feesUsd, tvlUsd } = pool.rows.reduce((totals, row) => {
      const tokenPrice = prices.get(row.mint);
      if (!tokenPrice) return totals;
      const rawToUsd = tokenPrice.price / (10 ** tokenPrice.decimals);
      totals.volumeUsd += Number(row.daily_volume) * rawToUsd;
      totals.feesUsd += Number(row.daily_fees) * rawToUsd;
      totals.tvlUsd += Number(row.reserve_balance) * tokenPrice.price;
      return totals;
    }, { volumeUsd: 0, feesUsd: 0, tvlUsd: 0 });

    if (tvlUsd < MIN_TVL_USD && volumeUsd > tvlUsd * MAX_VOLUME_TO_TVL) {
      lowTvlHighVolumePools++;
      continue;
    }
    if (feesUsd > volumeUsd * MAX_FEE_RATE) {
      excessiveFeeRatePools++;
      continue;
    }

    for (const row of pool.rows) {
      dailyVolume.add(row.mint, row.daily_volume);
      dailyFees.add(row.mint, row.daily_fees, METRIC.SWAP_FEES);
      dailyProtocolRevenue.add(row.mint, row.daily_protocol_revenue, METRIC.PROTOCOL_FEES);
      dailySupplySideRevenue.add(row.mint, row.daily_supply_side_revenue, METRIC.LP_FEES);
    }
  }

  options.api.log(
    `meteora-dlmm: included ${pools.size - lowTvlHighVolumePools - excessiveFeeRatePools}/${pools.size} pools; ` +
    `excluded ${lowTvlHighVolumePools} low-TVL/high-volume and ${excessiveFeeRatePools} excessive-fee-rate pools`,
  );

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue: dailyProtocolRevenue,
    dailyProtocolRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Volume: 'Actual input-token amounts transferred by traders in successful Meteora DLMM swaps, sourced from decoded onchain events.',
  Fees: 'Total onchain swap fees, valued by DefiLlama at the reporting timestamp. Pools with low TVL and implausibly high volume or fees are excluded using the same DefiLlama prices.',
  Revenue: 'The protocol_fee amount retained by Meteora after any host fee.',
  ProtocolRevenue: 'The protocol_fee amount retained by Meteora after any host fee.',
  SupplySideRevenue: 'Gross fees minus Meteora protocol revenue, including market-maker/LP, limit-order, and host fee recipients.',
};

const adapter: SimpleAdapter = {
  version: 1,
  methodology,
  fetch,
  chains: [CHAIN.SOLANA],
  start: '2023-11-07',
  dependencies: [Dependencies.DUNE],
  isExpensiveAdapter: true,
  breakdownMethodology: {
    Fees: {
      [METRIC.SWAP_FEES]: 'Gross swap fees paid by traders.',
    },
    Revenue: {
      [METRIC.PROTOCOL_FEES]: 'Swap fees retained by Meteora after host fees.',
    },
    ProtocolRevenue: {
      [METRIC.PROTOCOL_FEES]: 'Swap fees retained by Meteora after host fees.',
    },
    SupplySideRevenue: {
      [METRIC.LP_FEES]: 'Fees paid to market makers/LPs, limit-order providers, and hosts.',
    },
  },
};

export default adapter;
