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
  [CHAIN.ARBITRUM]: {
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
  [CHAIN.POLYGON]: {
    eventFeeCollected: 'event FeeCollected(address recipient, address indexed token, uint256 amount)',
    addresses: [
      '0xb300000b72deaeb607a12d5f54773d1c19c7028d',
    ],
  },
  [CHAIN.AVAX]: {
    eventFeeCollected: 'event FeeCollected(address recipient, address indexed token, uint256 amount)',
    addresses: [
      '0xb300000b72deaeb607a12d5f54773d1c19c7028d',
    ],
  },
  [CHAIN.OPTIMISM]: {
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
  [CHAIN.ERA]: {
    eventFeeCollected: 'event FeeCollected(address indexed token, address recipient, uint256 amount)',
    addresses: [
      '0x45a0B6ac062a6F137dDC12C01E580cfed1A6F4EC',
    ],
  },
  [CHAIN.LINEA]: {
    eventFeeCollected: 'event FeeCollected(address indexed token, address recipient, uint256 amount)',
    addresses: [
      '0xe8B592a331a192d5988EFFff40586CF032e26277',
    ],
  },
  [CHAIN.SONIC]: {
    eventFeeCollected: 'event FeeCollected(address indexed token, address recipient, uint256 amount)',
    addresses: [
      '0x610776e63C5ca21B92217F4c06398E5437dB6A1E',
    ],
  },
  [CHAIN.PLASMA]: {
    eventFeeCollected: 'event FeeCollected(address indexed token, address recipient, uint256 amount)',
    addresses: [
      '0x610776e63C5ca21B92217F4c06398E5437dB6A1E',
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