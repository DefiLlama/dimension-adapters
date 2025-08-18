import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

interface IRouter {
  eventFeeCollected: string;
  addresses: Array<string>;
}

const routers: Record<string, IRouter> = {
  [CHAIN.ETHEREUM]: {
    eventFeeCollected: 'event FeeCollected(address recipient, address indexed token, uint256 amount)',
    addresses: [
      '0xb300000b72deaeb607a12d5f54773d1c19c7028d',
    ],
  },
  [CHAIN.BASE]: {
    eventFeeCollected: 'event FeeCollected(address recipient, address indexed token, uint256 amount)',
    addresses: [
      '0xb300000b72deaeb607a12d5f54773d1c19c7028d',
    ],
  },
  [CHAIN.BSC]: {
    eventFeeCollected: 'event FeeCollected(address indexed token, address recipient, uint256 amount)',
    addresses: [
      '0xb300000b72deaeb607a12d5f54773d1c19c7028d',
    ],
  },
}

const fetch: any = async (options: FetchOptions) => {
  const dailyFees = options.createBalances()

  const events: Array<any> = await options.getLogs({
    eventAbi: 'event FeeCollected(address recipient, address indexed token, uint256 amount)',
    targets: routers[options.chain].addresses,
    flatten: true,
  })
  for (const event of events) {
    dailyFees.add(event.token, event.amount)
  }

  return {
    dailyFees: dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue: dailyFees,
  }
}

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  methodology: {
    Fees: 'Fees paid by users while trading via Binance Alpha app.',
    UserFees: 'Fees paid by users while trading via Binance Alpha app.',
    Revenue: 'All fees are collected by Binance.',
  },
  chains: Object.keys(routers),
  start: '2024-05-28',
}

export default adapter;