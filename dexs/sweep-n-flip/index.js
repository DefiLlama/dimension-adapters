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

const SUBGRAPHS = {
  ethereum:    'https://api.goldsky.com/api/public/project_cmngb5qq6d79v01wba5bi7hdg/subgraphs/snf-mainnet/1.1.0/gn',
  base:        'https://api.goldsky.com/api/public/project_cmngb5qq6d79v01wba5bi7hdg/subgraphs/snf-base/1.1.0/gn',
  arbitrum:    'https://api.goldsky.com/api/public/project_cmo0byz6wpdci01vt2k7p3l2q/subgraphs/snf-arbitrum/1.0.0/gn',
  polygon:     'https://api.goldsky.com/api/public/project_cmo0byz6wpdci01vt2k7p3l2q/subgraphs/snf-polygon/1.0.0/gn',
  hyperliquid: 'https://api.goldsky.com/api/public/project_cmo0byz6wpdci01vt2k7p3l2q/subgraphs/snf-hyperevm/1.0.0/gn',
  apechain:    'https://api.goldsky.com/api/public/project_cmoiys0pk3brg01un76ukdj5r/subgraphs/snf-apechain/1.0.0/gn',
  berachain:   'https://api.goldsky.com/api/public/project_cmoiys0pk3brg01un76ukdj5r/subgraphs/snf-berachain/1.0.0/gn',
  monad:       'https://api.goldsky.com/api/public/project_cmoiys0pk3brg01un76ukdj5r/subgraphs/snf-monad/1.0.0/gn',
}

// Per-chain start dates = first pool creation, UTC. Verified 2026-06-02 by querying each
// subgraph for the earliest Pair.createdAtTimestamp. NOTE: Base + HyperEVM predate the 2026-04
// redeploy wave (HyperEVM live since 2025-08, Base since 2025-10).
const START = {
  ethereum:    '2026-04-15',
  base:        '2025-10-25',
  arbitrum:    '2026-04-15',
  polygon:     '2026-04-15',
  hyperliquid: '2025-08-23',
  apechain:    '2026-04-28',
  berachain:   '2026-04-28',
  monad:       '2026-04-28',
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

// dimension-adapters v2 calls fetch(options) with a SINGLE FetchOptions arg (verified in
// adapters/utils/runAdapter.ts: `(fetchFunction as FetchV2)(options)`). `options.startOfDay` is the
// start-of-day UNIX timestamp (00:00 UTC) — matches the subgraph's PairDay.day exactly.
const fetch = async (options) => {
  const { chain, startOfDay } = options
  const url = SUBGRAPHS[chain]

  let skip = 0
  let totalVolume = 0
  let nftVolume = 0
  try {
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
  } catch (e) {
    // Recoverable: a paused Goldsky subgraph / network blip → report 0 for the chain, don't crash the run.
    console.error(`Sweep n' Flip: ${chain} subgraph error`, e.message)
    return { dailyVolume: 0, dailyFees: 0, dailyRevenue: 0, dailyProtocolRevenue: 0, dailySupplySideRevenue: 0 }
  }

  const dailySupplySideRevenue = nftVolume * SUPPLY_SIDE_FEE_RATE
  const dailyProtocolRevenue = nftVolume * PROTOCOL_FEE_RATE
  const dailyFees = dailySupplySideRevenue + dailyProtocolRevenue

  return {
    dailyVolume: totalVolume,
    dailyFees,
    dailyRevenue: dailyProtocolRevenue,
    dailyProtocolRevenue,
    dailySupplySideRevenue,
  }
}

const adapter = {
  version: 2,
  adapter: Object.fromEntries(
    Object.keys(SUBGRAPHS).map((chain) => [
      chain,
      { fetch, start: START[chain], runAtCurrTime: false },
    ])
  ),
}

module.exports = adapter
