import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const configs: Record<string, { contracts: Array<string>, start: string }> = {
  [CHAIN.ETHEREUM]: {
    start: '2022-10-05',
    contracts: [
      '0x0fe08D911246566fdFD4afE0181a21ab810EE1C2',
    ],
  },
  [CHAIN.POLYGON]: {
    start: '2022-10-05',
    contracts: [
      '0x0AC79b8711A92340e55ACf6ACceC03df6e181171',
    ],
  },
  [CHAIN.BASE]: {
    start: '2023-10-15',
    contracts: [
      '0x652A545E3eBb5d1a81C7F03Fed19804f15AAbc3a',
    ],
  },
  [CHAIN.BSC]: {
    start: '2022-10-05',
    contracts: [
      '0x77eEb345cd1763B077E67732c50EeFFB918BdF77',
    ],
  },
  [CHAIN.ARBITRUM]: {
    start: '2023-01-01',
    contracts: [
      '0x3a01FCE88dae24A7B01620Db2F348aB1E50e2150',
    ],
  },
  [CHAIN.OPTIMISM]: {
    start: '2023-01-01',
    contracts: [
      '0xC7689fCceB570B0BD397C847491Bc645BFDd88a3',
    ],
  },
  [CHAIN.AVAX]: {
    start: '2023-01-01',
    contracts: [
      '0x1D26ebaf6AD7BAab6D94dD8d9841f960FAF2dEe2',
    ],
  },
}

const PaymentEvent = 'event Payment (address to, address indexed from, address indexed sourceToken, uint256 sourceTokenAmount, address paymentToken, uint256 paymentTokenAmount, bytes32 indexed paymentReference)';

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  
  const logs = await options.getLogs({
    targets: configs[options.chain].contracts,
    eventAbi: PaymentEvent,
    flatten: true,
  })

  for (const log of logs) {
    dailyVolume.add(log.paymentToken, log.paymentTokenAmount);
  }

  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  adapter: configs
};

export default adapter;