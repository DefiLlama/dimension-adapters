import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";

const contract_v1_4 = '0x00000000000001ad428e4906ae43d8f9852d0dd6';
const contract_v1_5 = '0x00000000000000adc04c56bf30ac9d3c0aaf14dc';
const contract_v1_6 = '0x0000000000000068F116a894984e2DB1123eB395';
const defaultSeaports = [contract_v1_4, contract_v1_5, contract_v1_6]
const defaltFeeCollectors = ['0x0000a26b00c1f0df003000390027140000faa719']

const isFungible = (i: any) => +i.itemType.toString() < 2 // NATIVE or ERC20

const event_order_fulfilled = "event OrderFulfilled(bytes32 orderHash, address indexed offerer, address indexed zone, address recipient, (uint8 itemType, address token, uint256 identifier, uint256 amount)[] offer, (uint8 itemType, address token, uint256 identifier, uint256 amount, address recipient)[] consideration)"

const config: any = {
  [CHAIN.ETHEREUM]: {
    fees_collectors: [...defaltFeeCollectors, '0x31314e41E743A638FD485d537F4a2B5F57D662bb', '0x1208e7F7AED9d39Ed25ef582B8933e4a1D0DA6af']
  },
  [CHAIN.ARBITRUM]: {},
  [CHAIN.AVAX]: {},
  [CHAIN.BASE]: {},
  [CHAIN.BLAST]: {},
  [CHAIN.KLAYTN]: {},
  [CHAIN.OPTIMISM]: {},
  [CHAIN.POLYGON]: {},
  [CHAIN.ZORA]: {},
  [CHAIN.HYPERLIQUID]: {},
  [CHAIN.ROBINHOOD]: {},
  [CHAIN.ELYSIUM]: { start: '2026-11-05' },
}

const fetch = async ({ createBalances, getLogs, chain, }: FetchOptions) => {
  const dailyFees = createBalances()
  const dailyRevenue = createBalances()
  const dailySupplySideRevenue = createBalances()
  const { seaports = defaultSeaports, fees_collectors = defaltFeeCollectors } = config[chain]
  const feeCollectorSet = new Set(fees_collectors.map((i: any) => i.toLowerCase()));

  const logs = await getLogs({ targets: seaports, eventAbi: event_order_fulfilled, })

  logs.forEach(log => {
    const recipients = log.consideration.filter(isFungible) // exclude NFTs (ERC721 and ERC1155)
    if (!recipients.length) return;
    const biggestValue = recipients.reduce((a: any, b: any) => a.amount > b.amount ? a : b)

    // A listing pays the seller in the consideration, as its biggest fungible item. An accepted offer (ERC20 offered, NFT
    // asked) pays the seller out of the offer, so its fungible consideration is fees only, unless an item takes half of it.
    const isOfferFill = log.offer.length > 0 && log.offer.every((i: any) => +i.itemType.toString() === 1) && log.consideration.some((i: any) => !isFungible(i))
    const offerAmount = log.offer.filter((i: any) => i.token.toLowerCase() === biggestValue.token.toLowerCase()).reduce((a: bigint, i: any) => a + BigInt(i.amount), 0n)
    const sellerInConsideration = !isOfferFill || BigInt(biggestValue.amount) * 2n >= offerAmount

    recipients.forEach((consideration: any) => {
      if (sellerInConsideration && consideration.recipient === biggestValue.recipient) return; // this is sent to the NFT owner, doesn't include fees
      if (feeCollectorSet.has(consideration.recipient.toLowerCase())) {
        dailyFees.add(consideration.token, consideration.amount, METRIC.TRADING_FEES)
        dailyRevenue.add(consideration.token, consideration.amount, 'Trading Fees To OpenSea')
      }
      else {
        dailyFees.add(consideration.token, consideration.amount, METRIC.CREATOR_FEES)
        dailySupplySideRevenue.add(consideration.token, consideration.amount, 'Creator Fees To Creators')
      }
    })
  })

  return {
    dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue.clone(), dailySupplySideRevenue
  }
}

const seaportConfig = { fetch, start: '2022-06-12', }

const methodology = {
  Fees: 'Marketplace fees and creator royalties paid in ETH/ERC20 on NFT trades filled through Seaport, on listings and on accepted offers.',
  Revenue: 'Marketplace fees paid to OpenSea fee collectors.',
  ProtocolRevenue: 'Marketplace fees paid to OpenSea fee collectors.',
  SupplySideRevenue: 'Fees paid to other recipients: creator royalties, and fees of other marketplaces that use Seaport.',
}

const breakdownMethodology = {
  Fees: {
    [METRIC.TRADING_FEES]: 'Marketplace fees paid to OpenSea fee collectors.',
    [METRIC.CREATOR_FEES]: 'Fees paid to other recipients on the order: creator royalties, and fees of other marketplaces that use Seaport.',
  },
  Revenue: {
    'Trading Fees To OpenSea': 'Marketplace fees paid to OpenSea fee collectors.',
  },
  ProtocolRevenue: {
    'Trading Fees To OpenSea': 'Marketplace fees paid to OpenSea fee collectors.',
  },
  SupplySideRevenue: {
    'Creator Fees To Creators': 'Fees paid to other recipients on the order: creator royalties, and fees of other marketplaces that use Seaport.',
  },
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  methodology,
  breakdownMethodology,
  adapter: Object.keys(config).reduce((acc: any, chain) => {
    acc[chain] = { ...seaportConfig, start: config[chain].start ?? seaportConfig.start }
    return acc
  }, {}),
};

export default adapter;
