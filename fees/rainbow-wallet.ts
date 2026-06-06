import { Adapter, Dependencies, FetchOptions, } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryDuneSql } from "../helpers/dune";
import { METRIC } from "../helpers/metrics";

const rainbowRouter = '0x00000000009726632680fb29d3f7a9734e3010e2'

const RainBowRouter = {
  [CHAIN.ETHEREUM]: rainbowRouter,
  [CHAIN.OPTIMISM]: rainbowRouter,
  [CHAIN.BSC]: rainbowRouter,
  [CHAIN.UNICHAIN]: '0x2a0332E28913A06Fa924d40A3E2160f763010417',
  [CHAIN.POLYGON]: rainbowRouter,
  [CHAIN.BASE]: rainbowRouter,
  [CHAIN.ARBITRUM]: rainbowRouter,
  [CHAIN.AVAX]: rainbowRouter,
  [CHAIN.INK]: rainbowRouter,
  [CHAIN.BERACHAIN]: rainbowRouter,
  [CHAIN.BLAST]: rainbowRouter,
  [CHAIN.ZORA]: '0xA61550E9ddD2797E16489db09343162BE98d9483',
  [CHAIN.APECHAIN]: rainbowRouter,
  [CHAIN.GRAVITY]: rainbowRouter,
  [CHAIN.MONAD]: rainbowRouter,
}

// April 1 2026 00:00 UTC — Rainbow switched to sponsor transactions, causing
// many trades to have tx_to = multicall contract instead of the Rainbow Router.
// From this date, dex.trades under-reports volume; use the internal swap table instead.
const APRIL_1_2026 = '2026-04-01'

// Pre-April 2026: detect trades via Rainbow Router address in dex.trades
const PRE_APRIL_SQL = (options: FetchOptions) => `
  WITH eoa_router_trades AS (
      SELECT blockchain, tx_hash, SUM(amount_usd) AS amount_usd
      FROM dex.trades
      WHERE (
          (tx_to = 0x00000000009726632680fb29d3f7a9734e3010e2 AND blockchain NOT IN ('unichain', 'zora'))
          OR (tx_to = 0x2a0332E28913A06Fa924d40A3E2160f763010417 AND blockchain = 'unichain')
          OR (tx_to = 0xA61550E9ddD2797E16489db09343162BE98d9483 AND blockchain = 'zora')
      )
      AND block_time >= from_unixtime(${options.startTimestamp})
      AND block_time <= from_unixtime(${options.endTimestamp})
      GROUP BY 1, 2
  ),

  smart_wallet_validated AS (
      SELECT DISTINCT blockchain, tx_hash
      FROM tokens.transfers
      WHERE tx_from    = tx_to
        AND (
            ("to" = 0x00000000009726632680fb29d3f7a9734e3010e2 AND blockchain NOT IN ('unichain', 'zora'))
            OR ("to" = 0x2a0332E28913A06Fa924d40A3E2160f763010417 AND blockchain = 'unichain')
            OR ("to" = 0xA61550E9ddD2797E16489db09343162BE98d9483 AND blockchain = 'zora')
        )
        AND block_date >= DATE '2026-02-25'
        AND block_time >= from_unixtime(${options.startTimestamp})
        AND block_time <= from_unixtime(${options.endTimestamp})
  ),

  smart_wallet_trades AS (
      SELECT t.blockchain, t.tx_hash, SUM(t.amount_usd) AS amount_usd
      FROM dex.trades t
      INNER JOIN smart_wallet_validated s
          ON t.blockchain = s.blockchain
         AND t.tx_hash    = s.tx_hash
      WHERE t.block_date >= DATE '2026-02-25'
        AND t.block_time >= from_unixtime(${options.startTimestamp})
        AND t.block_time <= from_unixtime(${options.endTimestamp})
      GROUP BY 1, 2
  ),

  combined AS (
      SELECT blockchain, tx_hash, amount_usd FROM eoa_router_trades
      UNION ALL
      SELECT blockchain, tx_hash, amount_usd FROM smart_wallet_trades
  ),

  relay_bridge AS (
      SELECT
          CASE
              WHEN origin = 'bnb'         THEN 'bsc'
              WHEN origin = 'avalanche_c' THEN 'avax'
              ELSE origin
          END AS chain,
          SUM(usd_vol)          AS volume,
          SUM(usd_vol) * 0.0025 AS fees
      FROM dune.rainbowdotme.result_rainbow_relay_tx
      WHERE block_time >= from_unixtime(${options.startTimestamp})
        AND block_time <  from_unixtime(${options.endTimestamp})
      GROUP BY 1
  ),

  swap_fees AS (
      SELECT
          CASE
              WHEN blockchain = 'bnb'         THEN 'bsc'
              WHEN blockchain = 'avalanche_c' THEN 'avax'
              ELSE blockchain
          END AS chain,
          SUM(amount_usd)          AS volume,
          SUM(amount_usd * 0.0085) AS fees
      FROM combined
      GROUP BY 1
  ),

  total_fees AS (
      SELECT chain, fee_type, SUM(volume) AS volume, SUM(fees) AS fees
      FROM (
          SELECT chain, '${METRIC.SWAP_FEES}' AS fee_type, volume, fees FROM swap_fees
          UNION ALL
          SELECT chain, 'Bridge Fees' AS fee_type, volume, fees FROM relay_bridge
      ) AS all_fees
      GROUP BY chain, fee_type
  )
  SELECT chain, fee_type, volume, fees FROM total_fees
`

// April 2026+: use Rainbow's internal swap table which captures all trades
// including those routed via sponsor/multicall transactions
const POST_APRIL_SQL = (options: FetchOptions) => `
  WITH swap_fees AS (
      SELECT
          CASE
              WHEN network = 'bnb'         THEN 'bsc'
              WHEN network = 'avalanche_c' THEN 'avax'
              ELSE network
          END AS chain,
          SUM(usd_vol) AS volume,
          SUM(usd_fee) AS fees
      FROM dune.rainbowdotme.result_rainbow_swaps_core_aggregated_with_prices_since_april
      WHERE time >= from_unixtime(${options.startTimestamp})
        AND time <  from_unixtime(${options.endTimestamp})
      GROUP BY 1
  ),

  relay_bridge AS (
      SELECT
          CASE
              WHEN origin = 'bnb'         THEN 'bsc'
              WHEN origin = 'avalanche_c' THEN 'avax'
              ELSE origin
          END AS chain,
          SUM(usd_vol)          AS volume,
          SUM(usd_vol) * 0.0025 AS fees
      FROM dune.rainbowdotme.result_rainbow_relay_tx
      WHERE block_time >= from_unixtime(${options.startTimestamp})
        AND block_time <  from_unixtime(${options.endTimestamp})
      GROUP BY 1
  ),

  total_fees AS (
      SELECT chain, fee_type, SUM(volume) AS volume, SUM(fees) AS fees
      FROM (
          SELECT chain, '${METRIC.SWAP_FEES}' AS fee_type, volume, fees FROM swap_fees
          UNION ALL
          SELECT chain, 'Bridge Fees' AS fee_type, volume, fees FROM relay_bridge
      ) AS all_fees
      GROUP BY chain, fee_type
  )
  SELECT chain, fee_type, volume, fees FROM total_fees
`

const prefetch = async (options: FetchOptions) => {
  const now = Date.now();
  const sixHoursAgo = now - 6 * 60 * 60 * 1000;
  if (options.toTimestamp * 1000 > sixHoursAgo) {
    throw new Error("End timestamp is less than 6 hours ago, skipping due to dune indexing delay");
  }
  
  const sql = options.dateString < APRIL_1_2026
    ? PRE_APRIL_SQL(options)
    : POST_APRIL_SQL(options)
  return queryDuneSql(options, sql)
}

const fetch: any = async (options: FetchOptions) => {
  const results = options.preFetchedResults || [];

  const dailyFees = options.createBalances();
  for (const result of results) {
    if (result.chain === options.chain) {
      dailyFees.addUSDValue(result.fees, result.fee_type);
    }
  }

  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  }
}

const methodology = {
  Fees: "0.85% fees from trading volume and 0.25% fees from bridge relaying volume",
  Revenue: "0.85% revenue from trading volume and 0.25% revenue from bridge relaying volume",
  ProtocolRevenue: "0.85% protocol revenue from trading volume and 0.25% protocol revenue from bridge relaying volume",
}

const breakdownMethodology = {
  Fees: {
    [METRIC.SWAP_FEES]: "0.85% of the volume is fees",
    'Bridge Fees': "0.25% of the volume is fees",
  },
  Revenue: {
    [METRIC.SWAP_FEES]: "0.85% of the volume is revenue",
    'Bridge Fees': "0.25% of the volume is revenue",
  },
  ProtocolRevenue: {
    [METRIC.SWAP_FEES]: "0.85% of the volume is protocol revenue",
    'Bridge Fees': "0.25% of the volume is protocol revenue",
  }
}

const adapter: Adapter = {
  fetch,
  chains: Object.keys(RainBowRouter),
  start: '2023-01-01',
  prefetch,
  dependencies: [Dependencies.DUNE],
  methodology,
  breakdownMethodology,
  isExpensiveAdapter: true,
}

export default adapter;
