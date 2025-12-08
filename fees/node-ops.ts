
import { FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const PaymentContract = '0xc02add3d60af95bd7652d68c7d510f0d52f994ef';
const OrderRecordedEvent = 'event OrderRecorded(string date, string skuName, uint256 totalOrderAmount, uint16 quantity, uint256 price, address indexed walletAddress, uint256 timestamp)'

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances()
  
  const events = await options.getLogs({
    target: PaymentContract,
    eventAbi: OrderRecordedEvent,
  })
  for (const e of events) {
    dailyFees.addUSDValue(Number(e.totalOrderAmount) / 1e18)
  }

  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
    dailyHoldersRevenue: 0,
  }
};

export default {
  version: 2,
  fetch,
  start: '2025-07-11',
  chains: [CHAIN.ARBITRUM],
  methodology: {
    Fees: "Payment made by the users, sum totalOrderAmount from OrderRecorded events.",
    Revenue: "All fees are protocol revenue.",
    ProtocolRevenue: "All fees are protocol revenue.",
    HoldersRevenue: "No revenue share to NODE token holders.",
  },
}