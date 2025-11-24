import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const seaport_contract_v1_6 = '0x0000000000000068F116a894984e2DB1123eB395';
const defaultSeaports = [seaport_contract_v1_6];
const defaltFeeCollectors = ['0x0a993347f6eeaefa5c101028f793eea9f8c9cb28']
const event_order_fulfilled = "event OrderFulfilled(bytes32 orderHash, address indexed offerer, address indexed zone, address recipient, (uint8 itemType, address token, uint256 identifier, uint256 amount)[] offer, (uint8 itemType, address token, uint256 identifier, uint256 amount, address recipient)[] consideration)"


export const config: any = {
  ethereum: {
    fees_collectors: [...defaltFeeCollectors]
  },  
}

export const fetch = async ({ createBalances, getLogs, chain, }: FetchOptions) => {
  const dailyRevenue = createBalances()
  const { seaports = defaultSeaports, fees_collectors = defaltFeeCollectors } = config[chain]
  const feeCollectorSet = new Set(fees_collectors.map((i: any) => i.toLowerCase()));

  const logs = await getLogs({ targets: seaports, eventAbi: event_order_fulfilled, })

  logs.forEach(log => {
    const recipients = log.consideration.filter((i: any) => +i.itemType.toString() < 2) // exclude NFTs (ERC721 and ERC1155)
    if (recipients.length < 2) return;
    const biggestValue = recipients.reduce((a: any, b: any) => a.amount > b.amount ? a : b)

    recipients.forEach((consideration: any) => {
      if (consideration.recipient === biggestValue.recipient) return; // this is sent to the NFT owner, rest are fees  
      if (feeCollectorSet.has(consideration.recipient.toLowerCase())) {
        dailyRevenue.add(consideration.token, consideration.amount)
      }
    })
  })

  return {
    dailyFees : dailyRevenue,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
  }

}

const methodology = {
  Fees: 'All fees paid by users for NFT on Spaace',
  Revenue: 'Fees are distributed to Spaace',
  ProtocolRevenue: 'Fees are distributed to Spaace protocol',
}

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.ETHEREUM],
  start: '2023-07-27',
  methodology
}

export default adapter;