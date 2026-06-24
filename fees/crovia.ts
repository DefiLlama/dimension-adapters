/**
 * Crovia — NFT marketplace fees adapter (Cronos).
 *
 * Drop-in for github.com/DefiLlama/dimension-adapters at `fees/crovia.ts`.
 * Source: on-chain `Filled` events from every CroviaTrade version (all share the
 * same ABI). Each fill carries the exact CRO `price`, marketplace `fee`, and
 * creator `royalty`, so every dimension is read straight from the log — no API,
 * no off-chain data.
 *
 * Reference implementation in the Crovia repo:
 *   nft-indexer/src/integrations/trade-event-scanner.ts  (same ABI + topic hash)
 *
 * Fees: Crovia charges the buyer 3% (2.5% for high-tier listings >= 4000 CRO),
 * the seller pays the creator royalty out of proceeds. `fee` = Crovia's cut,
 * `royalty` = creator earnings. Values are native CRO (wei) -> addGasToken().
 */
import { FetchOptions, SimpleAdapter } from '../adapters/types'
import { CHAIN } from '../helpers/chains'

// Every CroviaTrade version emits this identical event. Full-history coverage is
// just the address list below.
const FILLED_EVENT =
  'event Filled(bytes32 indexed listingHash, address indexed seller, address indexed buyer, address nftContract, uint256 tokenId, uint256 price, uint256 fee, uint256 royalty, address royaltyReceiver)'

// Authoritative addresses — resolved from contracts/deployments/cronos/*.json.
const TRADE_CONTRACTS = [
  '0x338eF6fFFFa25f60Fda4ab8C1A541bddC3eaE65a', // CroviaTrade   V1  (2026-04-28)
  '0xe7639240a885a1f3d97b362da14310e4897db64f', // CroviaTrade   V2  (2026-05-11)
  '0xA981F39EBB0484f69a3c4B3FaF439B054845F76A', // CroviaTrade   V3  (2026-05-14)
  '0x402920d26dca469699395f606e4c68b982d44ce8', // CroviaTrade   V4  (dormant)
  '0x6FE665F84daa4e104b478e0dcC169A5C7145De09', // CroviaTrade   V5  (proxy, live since 2026-06-01)
]

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances()
  const dailyFees = options.createBalances()
  const dailyRevenue = options.createBalances()
  const dailyProtocolRevenue = options.createBalances()
  const dailySupplySideRevenue = options.createBalances()

  const logs = await options.getLogs({ targets: TRADE_CONTRACTS, eventAbi: FILLED_EVENT })

  for (const log of logs) {
    dailyVolume.addGasToken(log.price)
    dailyProtocolRevenue.addGasToken(log.fee) // Crovia's cut
    dailySupplySideRevenue.addGasToken(log.royalty) // creator earnings
    // Fees / Revenue = marketplace fee + creator royalty ("all value collected").
    dailyFees.addGasToken(log.fee)
    dailyFees.addGasToken(log.royalty)
    dailyRevenue.addGasToken(log.fee)
    dailyRevenue.addGasToken(log.royalty)
  }

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailySupplySideRevenue,
    dailyHoldersRevenue: 0, // no on-chain token / revenue share
  }
}

const methodology = {
  Fees: 'Total value collected on each Crovia marketplace sale: the Crovia marketplace fee (3%, or 2.5% for high-tier listings >= 4000 CRO) plus the creator royalty, both in CRO.',
  UserFees: 'Fees paid by traders per sale: marketplace fee + creator royalty.',
  Revenue: 'Crovia marketplace fee + creator royalty (marketplace revenue + creator earnings).',
  ProtocolRevenue: 'The Crovia marketplace fee retained by the protocol (3% / 2.5%).',
  SupplySideRevenue: 'Creator royalties paid to collection creators on each sale.',
  HoldersRevenue: 'Crovia has no on-chain token; no revenue is distributed to holders.',
}

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.CRONOS],
  start: '2026-04-28', // first CroviaTrade (V1) deploy
  methodology,
}

export default adapter
