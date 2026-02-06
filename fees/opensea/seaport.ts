import { FetchOptions, } from "../../adapters/types";

const contract_v1_4 = '0x00000000000001ad428e4906ae43d8f9852d0dd6';
const contract_v1_5 = '0x00000000000000adc04c56bf30ac9d3c0aaf14dc';
const contract_v1_6 = '0x0000000000000068F116a894984e2DB1123eB395';
const defaultSeaports = [contract_v1_4, contract_v1_5, contract_v1_6]
const defaltFeeCollectors = ['0x0000a26b00c1f0df003000390027140000faa719']

const event_order_fulfilled = "event OrderFulfilled(bytes32 orderHash, address indexed offerer, address indexed zone, address recipient, (uint8 itemType, address token, uint256 identifier, uint256 amount)[] offer, (uint8 itemType, address token, uint256 identifier, uint256 amount, address recipient)[] consideration)"

export const config: any = {
  ethereum: {
    fees_collectors: [...defaltFeeCollectors, '0x31314e41E743A638FD485d537F4a2B5F57D662bb', '0x1208e7F7AED9d39Ed25ef582B8933e4a1D0DA6af']
  },
  arbitrum: {},
  avax: {},
  base: {},
  blast: {},
  klaytn: {},
  optimism: {},
  polygon: {},
  zora: {},
  hyperliquid: {},
}

export const fetch = async ({ createBalances, getLogs, chain, }: FetchOptions) => {
  const dailyFees = createBalances()
  const dailyRevenue = createBalances()
  const dailySupplySideRevenue = createBalances()
  const { seaports = defaultSeaports, fees_collectors = defaltFeeCollectors } = config[chain]
  const feeCollectorSet = new Set(fees_collectors.map((i: any) => i.toLowerCase()));

  const logs = await getLogs({ targets: seaports, eventAbi: event_order_fulfilled, })

  logs.forEach(log => {
    const recipients = log.consideration.filter((i: any) => +i.itemType.toString() < 2) // exclude NFTs (ERC721 and ERC1155)
    if (recipients.length < 2) return;
    const biggestValue = recipients.reduce((a: any, b: any) => a.amount > b.amount ? a : b)

    recipients.forEach((consideration: any) => {
      dailyFees.add(consideration.token, consideration.amount)
      if (feeCollectorSet.has(consideration.recipient.toLowerCase())) {
        dailyRevenue.add(consideration.token, consideration.amount)
      }
      else {
        dailySupplySideRevenue.add(consideration.token, consideration.amount) // this is sent to the NFT owner
      }
    })
  })

  return {
    dailyFees, dailyRevenue, dailySupplySideRevenue
  }

}
