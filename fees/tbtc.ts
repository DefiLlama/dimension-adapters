import ADDRESSES from '../helpers/coreAssets.json'
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";


const eventUnminted = 'event Unminted(address indexed from,uint256 amount)'
const fetch = async (options: FetchOptions) => {
  const logs = await options.getLogs({
    target: '0x9C070027cdC9dc8F82416B2e5314E11DFb4FE3CD',
    eventAbi: eventUnminted,
  })
  const dailyFees = options.createBalances()
  logs.forEach((log) => {
    const amount = log.amount
    dailyFees.add(ADDRESSES.ethereum.tBTC, amount)
  })
  dailyFees.resizeBy(0.002)
  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  }
}


const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch,
      start: '2023-01-23',
    }
  },
  methodology: {
    Fees: "Charged 0.2% on unminted tbtc.",
    Revenue: "Charged 0.2% on unminted tbtc.",
    ProtocolRevenue: "Charged 0.2% on unminted tbtc.",
  },
}
export default adapter;
