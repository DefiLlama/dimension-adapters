import { Adapter, Dependencies, FetchOptions, } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryDuneSql } from "../helpers/dune";
import { METRIC } from "../helpers/metrics";

const rainbowRouter = '0x00000000009726632680fb29d3f7a9734e3010e2'

type ChainConfig = Record<string, { router: string; duneChain: string; start: string }>

const chainConfig: ChainConfig = {
  [CHAIN.ETHEREUM]: { router: rainbowRouter, duneChain: 'ethereum', start: '2022-03-04' },
  [CHAIN.OPTIMISM]: { router: rainbowRouter, duneChain: 'optimism', start: '2022-03-04' },
  [CHAIN.BSC]: { router: rainbowRouter, duneChain: 'bnb', start: '2022-10-21' },
  [CHAIN.UNICHAIN]: { router: '0x2a0332E28913A06Fa924d40A3E2160f763010417', duneChain: 'unichain', start: '2025-02-10' },
  [CHAIN.POLYGON]: { router: rainbowRouter, duneChain: 'polygon', start: '2022-03-04' },
  [CHAIN.BASE]: { router: rainbowRouter, duneChain: 'base', start: '2023-08-01' },
  [CHAIN.B3]: { router: rainbowRouter, duneChain: 'b3', start: '2026-03-02' },
  [CHAIN.ARBITRUM]: { router: rainbowRouter, duneChain: 'arbitrum', start: '2022-03-04' },
  [CHAIN.AVAX]: { router: rainbowRouter, duneChain: 'avalanche_c', start: '2024-01-18' },
  [CHAIN.INK]: { router: rainbowRouter, duneChain: 'ink', start: '2024-12-18' },
  [CHAIN.BERACHAIN]: { router: rainbowRouter, duneChain: 'berachain', start: '2025-02-06' },
  [CHAIN.BLAST]: { router: rainbowRouter, duneChain: 'blast', start: '2024-03-26' },
  [CHAIN.ZORA]: { router: '0xA61550E9ddD2797E16489db09343162BE98d9483', duneChain: 'zora', start: '2024-03-28' },
  [CHAIN.APECHAIN]: { router: rainbowRouter, duneChain: 'apechain', start: '2024-10-21' },
  [CHAIN.DEGEN]: { router: rainbowRouter, duneChain: 'degen', start: '2024-04-30' },
  [CHAIN.CELO]: { router: rainbowRouter, duneChain: 'celo', start: '2025-10-09' },
  [CHAIN.GRAVITY]: { router: rainbowRouter, duneChain: 'gravity', start: '2025-01-25' },
  [CHAIN.LINEA]: { router: rainbowRouter, duneChain: 'linea', start: '2025-10-09' },
  [CHAIN.PLASMA]: { router: rainbowRouter, duneChain: 'plasma', start: '2025-10-09' },
  [CHAIN.SONIC]: { router: rainbowRouter, duneChain: 'sonic', start: '2025-10-09' },
  [CHAIN.MONAD]: { router: rainbowRouter, duneChain: 'monad', start: '2025-11-20' },
  [CHAIN.HYPERLIQUID]: { router: rainbowRouter, duneChain: 'hyperevm', start: '2025-10-14' },
  [CHAIN.KATANA]: { router: rainbowRouter, duneChain: 'katana', start: '2025-10-09' },
  [CHAIN.SCROLL]: { router: rainbowRouter, duneChain: 'scroll', start: '2025-10-09' },
  [CHAIN.WC]: { router: rainbowRouter, duneChain: 'worldchain', start: '2025-10-09' },
  [CHAIN.BOB]: { router: rainbowRouter, duneChain: 'bob', start: '2025-10-14' },
  [CHAIN.MANTLE]: { router: rainbowRouter, duneChain: 'mantle', start: '2025-10-14' },
  [CHAIN.PLUME]: { router: rainbowRouter, duneChain: 'plume', start: '2025-10-14' },
  [CHAIN.RONIN]: { router: rainbowRouter, duneChain: 'ronin', start: '2025-10-14' },
  [CHAIN.MEGAETH]: { router: rainbowRouter, duneChain: 'megaeth', start: '2025-12-02' },
}

const getRouterValues = (config: ChainConfig) => Object.entries(config)
  .map(([chain, { duneChain, router }]) => `('${chain}', '${duneChain}', ${router})`)
  .join(',\n        ')

const getDuneChainList = (config: ChainConfig) => Object.values(config)
  .map(({ duneChain }) => `'${duneChain}'`)
  .join(', ')

const getActiveChainConfig = (options: FetchOptions) => Object.fromEntries(
  Object.entries(chainConfig).filter(([, { start }]) =>
    Date.parse(`${start}T00:00:00Z`) <= options.endTimestamp * 1000
  )
) as ChainConfig

// April 1 2026 00:00 UTC — Rainbow switched to sponsor transactions, causing
// many trades to have tx_to = multicall contract instead of the Rainbow Router.
// From this date, dex.trades under-reports volume; use the internal swap table instead.
const APRIL_1_2026 = '2026-04-01'
const SMART_WALLET_START = '2026-02-25'

// Pre-April 2026: detect trades via Rainbow Router address in dex.trades
const PRE_APRIL_SQL = (options: FetchOptions, activeChainConfig: ChainConfig) => {
  const routerValues = getRouterValues(activeChainConfig)
  const duneChainList = getDuneChainList(activeChainConfig)

  return `
  WITH routers(chain, blockchain, router) AS (
      VALUES
      ${routerValues}
  ),
  eoa_router_trades AS (
      SELECT
          r.chain,
          SUM(t.amount_usd)          AS volume,
          SUM(t.amount_usd * 0.0085) AS fees
      FROM dex.trades t
      INNER JOIN routers r
        ON t.blockchain = r.blockchain
       AND t.tx_to = r.router
      WHERE t.blockchain IN (${duneChainList})
        AND t.block_date >= date(from_unixtime(${options.startTimestamp}))
        AND t.block_date <= date(from_unixtime(${options.endTimestamp}))
        AND TIME_RANGE
      GROUP BY 1
  ),

  smart_wallet_validated AS (
      SELECT DISTINCT r.chain, tf.blockchain, tf.tx_hash
      FROM tokens.transfers tf
      INNER JOIN routers r
        ON tf.blockchain = r.blockchain
       AND tf."to" = r.router
      WHERE tf.blockchain IN (${duneChainList})
        AND tf.tx_from = tf.tx_to
        AND tf.block_date >= DATE '${SMART_WALLET_START}'
        AND tf.block_date >= date(from_unixtime(${options.startTimestamp}))
        AND tf.block_date <= date(from_unixtime(${options.endTimestamp}))
        AND TIME_RANGE
  ),

  smart_wallet_trades AS (
      SELECT
          s.chain,
          SUM(t.amount_usd)          AS volume,
          SUM(t.amount_usd * 0.0085) AS fees
      FROM dex.trades t
      INNER JOIN smart_wallet_validated s
        ON t.blockchain = s.blockchain
       AND t.tx_hash = s.tx_hash
      WHERE t.blockchain IN (${duneChainList})
        AND t.block_date >= DATE '${SMART_WALLET_START}'
        AND t.block_date >= date(from_unixtime(${options.startTimestamp}))
        AND t.block_date <= date(from_unixtime(${options.endTimestamp}))
        AND TIME_RANGE
      GROUP BY 1
  ),

  relay_bridge AS (
      SELECT
          r.chain,
          SUM(rb.usd_vol)          AS volume,
          SUM(rb.usd_vol) * 0.0025 AS fees
      FROM dune.rainbowdotme.result_rainbow_relay_tx rb
      INNER JOIN routers r
        ON rb.origin = r.blockchain
      WHERE rb.origin IN (${duneChainList})
        AND TIME_RANGE
      GROUP BY 1
  ),

  swap_fees AS (
      SELECT chain, SUM(volume) AS volume, SUM(fees) AS fees
      FROM (
          SELECT chain, volume, fees FROM eoa_router_trades
          UNION ALL
          SELECT chain, volume, fees FROM smart_wallet_trades
      ) AS all_swaps
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
}

// April 2026+: use Rainbow's internal swap table which captures all trades
// including those routed via sponsor/multicall transactions
const POST_APRIL_SQL = (options: FetchOptions, activeChainConfig: ChainConfig) => {
  const routerValues = getRouterValues(activeChainConfig)
  const duneChainList = getDuneChainList(activeChainConfig)

  return `
  WITH routers(chain, blockchain, router) AS (
      VALUES
      ${routerValues}
  ),
  swap_fees AS (
      SELECT
          r.chain,
          SUM(s.usd_vol) AS volume,
          SUM(s.usd_fee) AS fees
      FROM dune.rainbowdotme.result_rainbow_swaps_core_aggregated_with_prices_since_april s
      INNER JOIN routers r
        ON s.network = r.blockchain
      WHERE s.network IN (${duneChainList})
        AND s.time >= from_unixtime(${options.startTimestamp})
        AND s.time <  from_unixtime(${options.endTimestamp})
      GROUP BY 1
  ),

  relay_bridge AS (
      SELECT
          r.chain,
          SUM(rb.usd_vol)          AS volume,
          SUM(rb.usd_vol) * 0.0025 AS fees
      FROM dune.rainbowdotme.result_rainbow_relay_tx rb
      INNER JOIN routers r
        ON rb.origin = r.blockchain
      WHERE rb.origin IN (${duneChainList})
        AND TIME_RANGE
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
}

const prefetch = async (options: FetchOptions) => {
  const now = Date.now();
  const sixHoursAgo = now - 6 * 60 * 60 * 1000;
  if (options.toTimestamp * 1000 > sixHoursAgo) {
    throw new Error("End timestamp is less than 6 hours ago, skipping due to dune indexing delay");
  }
  
  const activeChainConfig = getActiveChainConfig(options)
  if (!Object.keys(activeChainConfig).length) return []

  const sql = options.dateString < APRIL_1_2026
    ? PRE_APRIL_SQL(options, activeChainConfig)
    : POST_APRIL_SQL(options, activeChainConfig)
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
  version: 1,
  fetch,
  adapter: chainConfig,
  prefetch,
  dependencies: [Dependencies.DUNE],
  methodology,
  breakdownMethodology,
  isExpensiveAdapter: true,
}

export default adapter;
