import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types"
import { CHAIN } from "../helpers/chains"
import { queryAllium } from "../helpers/allium"
import { JUPITER_METRICS, jupTreasuryShare } from "./jupiter"
import { getJupiterStatsRevenue, JUPITER_STATS_API_START_TS } from "../helpers/jupiter-stats"

const fetchOnchain = async (options: FetchOptions) => {
  const data: { usd_amount: number; product: string }[] = await queryAllium(`
    -- v1: All transfers to fee wallet excluding transfers from the wallet itself
    SELECT 
      COALESCE(t.usd_amount, 0) as usd_amount,
      'lo_v1' as product
    FROM solana.assets.transfers t
    WHERE t.from_address != 'H3vkQqNVWySTD4c1Y91wtoT5iwxKSVtVLfC2rD8SgwTN'
      AND t.to_address = 'H3vkQqNVWySTD4c1Y91wtoT5iwxKSVtVLfC2rD8SgwTN'
      AND t.block_timestamp >= TO_TIMESTAMP_NTZ('${options.startTimestamp}')
      AND t.block_timestamp < TO_TIMESTAMP_NTZ('${options.endTimestamp}')

    UNION ALL

    -- v2: Fee vault inflows from limit fee vault to central address
    SELECT 
      COALESCE(t.usd_amount, 0) as usd_amount,
      'lo_v2' as product
    FROM solana.assets.transfers t
    WHERE t.from_address = '27ZASRjinQgXKsrijKqb9xyRnH6W5KWgLSDveRghvHqc'
      AND t.to_address = '7JQeyNK55fkUPUmEotupBFpiBGpgEQYLe8Ht1VdSfxcP'
      AND t.block_timestamp >= TO_TIMESTAMP_NTZ('${options.startTimestamp}')
      AND t.block_timestamp < TO_TIMESTAMP_NTZ('${options.endTimestamp}')
  `);

  const dailyFees = options.createBalances();

  data.forEach(row => {
    const metric = row.product === 'lo_v1' ? JUPITER_METRICS.LimitOrderV1Fees : JUPITER_METRICS.LimitOrderV2Fees;
    dailyFees.addUSDValue(row.usd_amount, metric);
  });

  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees.clone(jupTreasuryShare(options.startOfDay)),
    dailyHoldersRevenue: 0, // JUP buybacks are counted on the Jupiter Aggregator listing
  }
}

// From 2026-01-01, Jupiter's stats API, all under the v2 label: fees from the fee vault 27ZASRjinQgXKsrijKqb9xyRnH6W5KWgLSDveRghvHqc
// above, and fees on orders settled as swaps signed by gasAx5Y917MYdmdnwiomwYDhmDKNGDJnN1MmEbxVdVw.
const fetchStatsApi = async (options: FetchOptions) => {
  const { dailyFees, dailyRevenue } = await getJupiterStatsRevenue(options, { limit_order: JUPITER_METRICS.LimitOrderV2Fees })
  return { dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue.clone(jupTreasuryShare(options.startOfDay)), dailyHoldersRevenue: 0 }
}

const fetch = async (options: FetchOptions) =>
  options.startOfDay >= JUPITER_STATS_API_START_TS ? fetchStatsApi(options) : fetchOnchain(options)

const methodology = {
  Fees: 'Fees paid by users on limit orders.',
  Revenue: 'All limit order fees, kept by Jupiter.',
  ProtocolRevenue: "Half of limit order fees, kept by the treasury. The other half buys back JUP, counted on the Jupiter Aggregator listing.",
  HoldersRevenue: "No holders revenue on this listing: the JUP bought back with the other half of limit order fees is counted on the Jupiter Aggregator listing.",
}

const breakdownMethodology = {
  Fees: {
    [JUPITER_METRICS.LimitOrderV1Fees]: "Fees on limit orders v1.",
    [JUPITER_METRICS.LimitOrderV2Fees]: "Fees on limit orders v2.",
  },
  Revenue: {
    [JUPITER_METRICS.LimitOrderV1Fees]: "All limit order v1 fees, kept by Jupiter.",
    [JUPITER_METRICS.LimitOrderV2Fees]: "All limit order v2 fees, kept by Jupiter.",
  },
  ProtocolRevenue: {
    [JUPITER_METRICS.LimitOrderV1Fees]: "Half of limit order v1 fees, kept by the treasury.",
    [JUPITER_METRICS.LimitOrderV2Fees]: "Half of limit order v2 fees, kept by the treasury.",
  },
}

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.SOLANA],
  start: '2022-10-14',
  dependencies: [Dependencies.ALLIUM],
  isExpensiveAdapter: true,
  methodology,
  breakdownMethodology
}

export default adapter;
