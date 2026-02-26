import ADDRESSES from '../helpers/coreAssets.json'
import { FetchOptions, SimpleAdapter } from "../adapters/types"
import { CHAIN } from "../helpers/chains"
import { METRIC } from '../helpers/metrics'

const fetch = async ({ createBalances, getLogs }: FetchOptions) => {
  const dailyFees = createBalances()
  const dailyRevenue = createBalances()
  const logs = await getLogs({
    target: "0x00000000000E1A99dDDd5610111884278BDBda1D",
    eventAbi: 'event Bid(bytes32 from, uint256 amount, bytes32 name)'
  })
  logs.forEach((i: any) => {
    dailyFees.add(ADDRESSES.null, i.amount, METRIC.PROTOCOL_FEES)
    dailyRevenue.add(ADDRESSES.null, i.amount, METRIC.PROTOCOL_FEES)
  })
  return { dailyFees, dailyRevenue }
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ETHEREUM],
  start: '2024-02-01',
  methodology: {
    Fees: "Buy, registation fees paid by users.",
    Revenue: "Buy, registation fees paid by users.",
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.PROTOCOL_FEES]: "ETH paid by users when bidding on Clusters name registrations",
    },
    Revenue: {
      [METRIC.PROTOCOL_FEES]: "ETH collected as revenue from Clusters name registration bids",
    },
  }
}

export default adapter;