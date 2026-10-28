import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { nullAddress } from "../helpers/token";

// Contract list: https://github.com/manifoldxyz/manifold-contract-addresses (maintained by Manifold).

const MARKETPLACE_EVENTS = {
  purchase: 'event PurchaseEvent(uint40 indexed listingId, address referrer, address buyer, uint24 count, uint256 amount)',
  acceptOffer: 'event AcceptOfferEvent(uint40 indexed listingId, address oferrer, uint256 amount)',
  finalize: 'event FinalizeListing(uint40 indexed listingId)',
}

const GET_LISTING_ABI = 'function getListing(uint40 listingId) view returns ((uint256 id, address seller, bool finalized, uint24 totalSold, uint16 marketplaceBPS, uint16 referrerBPS, (uint256 initialAmount, uint8 type_, uint24 totalAvailable, uint24 totalPerSale, uint16 extensionInterval, uint16 minIncrementBPS, address erc20, address identityVerifier, uint48 startTime, uint48 endTime) details, (uint256 id, address address_, uint8 spec, bool lazy) token, (address receiver, uint16 receiverBPS)[] receivers, (uint16 deliverBPS, uint240 deliverFixed) fees, (uint256 amount, address bidder, bool delivered, bool settled, bool refunded, uint48 timestamp, address referrer) bid))'

const chainConfig: Record<string, { marketplace: string, start: string }> = {
  [CHAIN.ETHEREUM]: { marketplace: '0x3a3548e060be10c2614d0a4cb0c03cc9093fd799', start: '2022-07-08' },
  [CHAIN.OPTIMISM]: { marketplace: '0x5246807fb65d87b0d0a234e0f3d42374de83b421', start: '2023-06-21' },
  [CHAIN.BASE]: { marketplace: '0x5246807fb65d87b0d0a234e0f3d42374de83b421', start: '2024-01-02' },
  [CHAIN.SHAPE]: { marketplace: '0x5246807fb65d87b0d0a234e0f3d42374de83b421', start: '2025-04-03' },
}

const fetch = async (options: FetchOptions) => {
  const { marketplace } = chainConfig[options.chain]
  const dailyVolume = options.createBalances()

  const purchases = await options.getLogs({ target: marketplace, eventAbi: MARKETPLACE_EVENTS.purchase })
  const acceptedOffers = await options.getLogs({ target: marketplace, eventAbi: MARKETPLACE_EVENTS.acceptOffer })
  const finalized = await options.getLogs({ target: marketplace, eventAbi: MARKETPLACE_EVENTS.finalize })

  const listingIds = [...new Set([...purchases, ...acceptedOffers, ...finalized].map((log: any) => log.listingId.toString()))]
  const listingsRes = await options.api.multiCall({ target: marketplace, abi: GET_LISTING_ABI, calls: listingIds })
  const listings: Record<string, any> = {}
  listingIds.forEach((id, i) => listings[id] = listingsRes[i])

  const addSale = (listingId: any, amount: any) => {
    const erc20 = listings[listingId.toString()].details.erc20
    if (erc20 === nullAddress) dailyVolume.addGasToken(amount)
    else dailyVolume.add(erc20, amount)
  }
  purchases.forEach((log: any) => addSale(log.listingId, log.amount))
  acceptedOffers.forEach((log: any) => addSale(log.listingId, log.amount))
  finalized.forEach((log: any) => {
    const { bid } = listings[log.listingId.toString()]
    if (bid.bidder !== nullAddress) addSale(log.listingId, bid.amount)
  })

  return { dailyVolume }
}

const methodology = {
  Volume: 'Value of NFTs sold on the Manifold Marketplace: fixed price purchases, accepted offers and settled auctions. Edition mints are not counted.',
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  adapter: chainConfig,
  methodology,
}

export default adapter;
