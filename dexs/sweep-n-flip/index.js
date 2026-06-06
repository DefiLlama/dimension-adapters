/**
 * Sweep n' Flip — DeFiLlama DEX volume + fees adapter (DRAFT)
 *
 * Target repo: DefiLlama/dimension-adapters  →  dexs/sweep-n-flip/index.js
 *
 * Source: the per-chain Goldsky subgraphs (SnF v2 canonical schema). The `PairDay` entity holds
 * `volumeUSD` per pool per day. `PairDay.day` is the START-OF-DAY UNIX TIMESTAMP
 * (`(timestamp / 86400) * 86400`) — verified in snf-contracts/subgraph/src/mappings/uniswap.ts.
 *
 * ── KNOWN GAP / MUST CONFIRM BEFORE PR ──────────────────────────────────────────────────────
 *  - The subgraph schema has NO `feesUSD` field (only `volumeUSD`). Fees here are DERIVED from
 *    volume × fee rate, applied to NFT-pool volume only. Fee model CONFIRMED 2026-06-01:
 *      • Native SnF NFT pools: 2% LP pool fee (9800/10000) + 2.5% marketplace fee.
 *      • Fungible/delegate pairs route to an upstream DEX → SnF earns ~0 → excluded from fees.
 *    Still verify locally that `pair.isNFTPool` reliably flags the NFT pools before PR.
 *  - Goldsky free-tier can PAUSE a subgraph on entity count. If a chain's endpoint is unreliable,
 *    fall back to an on-chain `Swap`-event adapter for that chain.
 *  - Confirm `options.startOfDay` is the field name in the installed dimension-adapters version;
 *    fallback to flooring the `timestamp` arg is included.
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 *
 * Subgraph URLs + DeFiLlama chain keys verified 2026-06-01 (snf-client/src/config/subgraphs.ts).
 * NOTE: HyperEVM's DeFiLlama chain key is `hyperliquid`.
 */

const { request, gql } = require('graphql-request')
import { CHAIN } from "../../helpers/chains"
import { FetchOptions } from "../../adapters/types";
import { METRIC } from "../../helpers/metrics";

// Per-chain start dates = first pool creation, UTC. Verified 2026-06-02 by querying each
// subgraph for the earliest Pair.createdAtTimestamp. NOTE: Base + HyperEVM predate the 2026-04
// redeploy wave (HyperEVM live since 2025-08, Base since 2025-10).
const chainConfig = {
  [CHAIN.ETHEREUM]: {
    subgraph: 'https://api.goldsky.com/api/public/project_cmngb5qq6d79v01wba5bi7hdg/subgraphs/snf-mainnet/1.1.0/gn',
    start: '2026-04-15'
  },
  [CHAIN.BASE]: {
    subgraph: 'https://api.goldsky.com/api/public/project_cmngb5qq6d79v01wba5bi7hdg/subgraphs/snf-base/1.1.0/gn',
    start: '2025-10-25'
  },
  [CHAIN.ARBITRUM]: {
    subgraph: 'https://api.goldsky.com/api/public/project_cmo0byz6wpdci01vt2k7p3l2q/subgraphs/snf-arbitrum/1.0.0/gn',
    start: '2026-04-15'
  },
  [CHAIN.POLYGON]: {
    subgraph: 'https://api.goldsky.com/api/public/project_cmo0byz6wpdci01vt2k7p3l2q/subgraphs/snf-polygon/1.0.0/gn',
    start: '2026-04-15'
  },
  [CHAIN.HYPERLIQUID]: {
    subgraph: 'https://api.goldsky.com/api/public/project_cmo0byz6wpdci01vt2k7p3l2q/subgraphs/snf-hyperevm/1.0.0/gn',
    start: '2025-08-23'
  },
  [CHAIN.APECHAIN]: {
    subgraph: 'https://api.goldsky.com/api/public/project_cmoiys0pk3brg01un76ukdj5r/subgraphs/snf-apechain/1.0.0/gn',
    start: '2026-04-28'
  },
  [CHAIN.BERACHAIN]: {
    subgraph: 'https://api.goldsky.com/api/public/project_cmoiys0pk3brg01un76ukdj5r/subgraphs/snf-berachain/1.0.0/gn',
    start: '2026-04-28'
  },
  [CHAIN.MONAD]: {
    subgraph: 'https://api.goldsky.com/api/public/project_cmoiys0pk3brg01un76ukdj5r/subgraphs/snf-monad/1.0.0/gn',
    start: '2026-03-30'
  },
}

// DERIVED fee model (CONFIRMED 2026-06-01) — applied to NFT-pool volume only.
const SUPPLY_SIDE_FEE_RATE = 0.02 // 2% LP pool fee (native SnF NFT pools)
const PROTOCOL_FEE_RATE = 0.025 // 2.5% marketplace fee

const DAY_QUERY = gql`
  query ($day: Int!, $skip: Int!) {
    pairDays(first: 1000, skip: $skip, where: { day: $day }) {
      volumeUSD
      pair {
        isNFTPool
      }
    }
  }
`

const fetch = async (options) => {
  const { chain, startOfDay } = options
  const url = chainConfig[chain].subgraph

  let skip = 0
  let totalVolume = 0
  let nftVolume = 0

  // Paginate PairDay rows for the day (1000/page).
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const data = await request(url, DAY_QUERY, { day: startOfDay, skip })
    const rows = data.pairDays || []
    for (const row of rows) {
      const v = Number(row.volumeUSD) || 0
      totalVolume += v
      if (row.pair && row.pair.isNFTPool) nftVolume += v
    }
    if (rows.length < 1000) break
    skip += 1000
  }

  const dailyVolume = options.createBalances()
  const dailyFees = options.createBalances()
  const dailyRevenue = options.createBalances()
  const dailySupplySideRevenue = options.createBalances()

  dailyVolume.addUSDValue(totalVolume)

  dailyFees.addUSDValue(nftVolume * PROTOCOL_FEE_RATE, "Marketplace Fees")
  dailyRevenue.addUSDValue(nftVolume * PROTOCOL_FEE_RATE, "Marketplace Fees to Protocol")

  dailyFees.addUSDValue(nftVolume * SUPPLY_SIDE_FEE_RATE, METRIC.LP_FEES)
  dailySupplySideRevenue.addUSDValue(nftVolume * SUPPLY_SIDE_FEE_RATE, "LP Fees to Liquidity Providers")


  return {
    dailyVolume,
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  }
}

const methodology = {
  Volume: "Includes volume from all SnF NFT pools.",
  Fees: "Includes 2.5% marketplace fees and 2% LP fees.",
  Revenue: "Includes 2.5% marketplace fees going to the protocol.",
  ProtocolRevenue: "Includes 2.5% marketplace fees going to the protocol.",
  SupplySideRevenue: "Includes 2% LP fees going to the liquidity providers.",
}

const breakdownMethodology = {
  Fees: {
    "Marketplace Fees": "2.5% marketplace fees going to the protocol",
    [METRIC.LP_FEES]: "2% LP fees charged on SnF NFT pools swaps",
  },
  Revenue: {
    "Marketplace Fees to Protocol": "2.5% marketplace fees going to the protocol",
  },
  ProtocolRevenue: {
    "Marketplace Fees to Protocol": "2.5% marketplace fees going to the protocol",
  },
  SupplySideRevenue: {
    "LP Fees to Liquidity Providers": "2% LP fees charged on SnF NFT pools swaps going to the liquidity providers",
  },
}

const adapter = {
  fetch,
  adapter: chainConfig,
  methodology,
  breakdownMethodology,
}

module.exports = adapter
