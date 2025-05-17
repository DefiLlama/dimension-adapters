import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const opoolContract = '0x68b5a1c02dea0958388eee5361f021018bd8dbe7'
const event_indexbox = 'event Inbox(address indexed bridgeReceiver,address indexed bridgeToken,address indexed feeReceiver,address feeToken,uint256 feeAmount,uint256 bridgeAmount,bytes data)'
const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances()
  const logs = await options.getLogs({
    eventAbi: event_indexbox,
    target: opoolContract,
  })
  logs.forEach((log: any) => dailyFees.add(log.feeToken, log.feeAmount))
  return { dailyFees }
}

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch,
      start: '2024-12-06',
    },
    [CHAIN.OPTIMISM]: {
      fetch,
      start: '2024-12-06',
    },
    [CHAIN.BASE]: {
      fetch,
      start: '2024-12-06',
    },
    [CHAIN.ARBITRUM]: {
      fetch,
      start: '2024-12-06',
    },
    [CHAIN.POLYGON]: {
      fetch,
      start: '2024-12-06',
    },
    [CHAIN.BSC]: {
      fetch,
      start: '2024-12-06',
    },
    [CHAIN.BLAST]: {
      fetch,
      start: '2024-12-06',
    },
  },
}
export default adapter