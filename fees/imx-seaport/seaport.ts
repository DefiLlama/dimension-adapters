import { FetchOptions, FetchResultFees } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const defaultSeaports = ['0x6c12aD6F0bD274191075Eb2E78D7dA5ba6453424'];
const defaultFeeCollectors = ['0xB2F4dCC6B02293088D3362E78A4AF0cd07c38B49'];

const event_order_fulfilled = "event OrderFulfilled(bytes32 orderHash, address indexed offerer, address indexed zone, address recipient, (uint8 itemType, address token, uint256 identifier, uint256 amount)[] offer, (uint8 itemType, address token, uint256 identifier, uint256 amount, address recipient)[] consideration)"

export const config: any = {
  [CHAIN.IMX]: {
    fees_collectors: [...defaultFeeCollectors]
  }
}

export const fetch = async ({ createBalances, getLogs, chain }: FetchOptions): Promise<FetchResultFees> => {
  const dailyFees = createBalances()
  const dailyRevenue = createBalances()
  const { seaports = defaultSeaports, fees_collectors = defaultFeeCollectors } = config[chain]
  const feeCollectorSet = new Set(fees_collectors.map((i: any) => i.toLowerCase()));

  const logs = await getLogs({ targets: seaports, eventAbi: event_order_fulfilled })

  logs.forEach(log => {
    const recipients = log.consideration.filter((i: any) => +i.itemType.toString() < 2) // exclude NFTs (ERC721 and ERC1155)
    if (recipients.length < 2) return;
    const biggestValue = recipients.reduce((a: any, b: any) => a.amount > b.amount ? a : b)

    recipients.forEach((consideration: { amount: bigint, recipient: string, token: string }) => {
      if (consideration.recipient === biggestValue.recipient) return; // this is sent to the NFT owner, rest are fees
      dailyFees.add(consideration.token, consideration.amount)
      if (feeCollectorSet.has(consideration.recipient.toLowerCase())) {
        dailyRevenue.add(consideration.token, consideration.amount)
      }
    })
  })

  return {
    dailyFees, dailyRevenue, dailyHoldersRevenue: dailyRevenue.clone(0.2), dailyProtocolRevenue: dailyRevenue.clone(0.8),
  }
} 