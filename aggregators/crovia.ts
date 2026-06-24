/**
 * Crovia — NFT marketplace aggregator adapter (Cronos).
 *
 * Drop-in for github.com/DefiLlama/dimension-adapters at `aggregators/crovia.ts`.
 * Source: on-chain `Buy` events from every CroviaRouter version (all share the
 * same ABI). When a user buys from an external marketplace (Ebisusbay / Minted)
 * through Crovia, the Router forwards `purchaseValue` to that marketplace and
 * collects `feeAmount` (Crovia's 1.5% aggregation fee) for the protocol.
 *
 * dailyVolume here is the GMV *routed through Crovia* to external marketplaces —
 * disjoint from the native marketplace volume in fees/crovia.ts (native fills go
 * through CroviaTrade.fillListing -> `Filled`, never the Router).
 */
import { FetchOptions, SimpleAdapter } from '../adapters/types'
import { CHAIN } from '../helpers/chains'

const BUY_EVENT =
  'event Buy(address indexed buyer, address indexed marketplace, address indexed nftContract, uint256 tokenId, uint256 purchaseValue, uint256 feeAmount)'

// Authoritative addresses — resolved from contracts/deployments/cronos/*.json.
const ROUTER_CONTRACTS = [
  '0xC34D2af8ca5784a53a2615f1CA6Ff61B988E32D8', // CroviaRouter   (2026-04-22)
  '0x929bD3860B9b615A3ba954FDdaD922306b03A6e5', // CroviaRouterV3 (2026-05-15)
  '0xCd5D596801c90fB345d5C4aFD5a740D08AF8b0De', // CroviaRouterV4 (proxy, live since 2026-05-18)
]

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances()
  const dailyFees = options.createBalances()
  const dailyRevenue = options.createBalances()
  const dailyProtocolRevenue = options.createBalances()

  const logs = await options.getLogs({ targets: ROUTER_CONTRACTS, eventAbi: BUY_EVENT })

  for (const log of logs) {
    dailyVolume.addGasToken(log.purchaseValue) // GMV routed to external marketplaces
    dailyFees.addGasToken(log.feeAmount) // Crovia's 1.5% aggregation fee
    dailyRevenue.addGasToken(log.feeAmount)
    dailyProtocolRevenue.addGasToken(log.feeAmount)
  }

  return { dailyVolume, dailyFees, dailyRevenue, dailyProtocolRevenue }
}

const methodology = {
  Volume: 'CRO value of NFT purchases routed through the Crovia aggregator to external Cronos marketplaces (Ebisusbay, Minted).',
  Fees: "Crovia's 1.5% aggregation fee charged on each routed purchase.",
  Revenue: "Crovia's 1.5% aggregation fee (all retained by the protocol).",
  ProtocolRevenue: "Crovia's 1.5% aggregation fee.",
}

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.CRONOS],
  start: '2026-04-22', // first CroviaRouter deploy
  methodology,
}

export default adapter
