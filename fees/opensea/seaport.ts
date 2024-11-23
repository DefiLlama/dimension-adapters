import { FetchOptions, } from "../../adapters/types";


const contract_v1_4 = '0x00000000000001ad428e4906ae43d8f9852d0dd6';
const contract_v1_5 = '0x00000000000000adc04c56bf30ac9d3c0aaf14dc';
const contract_v1_6 = '0x0000000000000068F116a894984e2DB1123eB395';

const event_order_fulfilled = "event OrderFulfilled(bytes32 orderHash, address indexed offerer, address indexed zone, address recipient, (uint8 itemType, address token, uint256 identifier, uint256 amount)[] offer, (uint8 itemType, address token, uint256 identifier, uint256 amount, address recipient)[] consideration)"
const fees_collectors = new Set(['0x0000a26b00c1f0df003000390027140000faa719', '0x31314e41E743A638FD485d537F4a2B5F57D662bb', '0x1208e7F7AED9d39Ed25ef582B8933e4a1D0DA6af'].map(i => i.toLowerCase()));

export const fetch = async ({ createBalances, getLogs, }: FetchOptions) => {
  const dailyFees = createBalances()
  const dailyRevenue = createBalances()

  const logs = await getLogs({ targets: [contract_v1_4, contract_v1_5, contract_v1_6], eventAbi: event_order_fulfilled, })

  logs.forEach(log => {
    if (log.consideration.length < 2) return;
    const biggestValue = log.consideration.reduce((a: any, b: any) => a.amount > b.amount ? a : b).amount

    log.consideration.forEach((consideration: any) => {
      if (consideration.amount >= biggestValue) return; // this is sent to the NFT owner, rest are fees
      dailyFees.add(consideration.token, consideration.amount)
      if (fees_collectors.has(consideration.recipient.toLowerCase())) {
        dailyRevenue.add(consideration.token, consideration.amount)
      }
    })
  })

  return {
    dailyFees, dailyRevenue,
  }

}
