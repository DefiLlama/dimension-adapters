import { FetchOptions, SimpleAdapter } from '../adapters/types';
import { CHAIN } from '../helpers/chains';
import { METRIC } from '../helpers/metrics';

interface IExchange {
  address: string,
  baseToken: string;
  baseTokenDecimals: number;
}

const exchangeConfigs: Record<string, Array<IExchange>> = {
  [CHAIN.ARBITRUM]: [
    {
      address: '0xF7CA7384cc6619866749955065f17beDD3ED80bC', // ETH/USDC
      baseToken: '0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8', // USDC
      baseTokenDecimals: 6,
    },
    {
      address: '0x85DDE4A11cF366Fb56e05cafE2579E7119D5bC2f', // WBTC/ETH
      baseToken: '0x82af49447d8a07e3bd95bd0d56f35241523fbab1', // ETH
      baseTokenDecimals: 18,
    },
  ],
  [CHAIN.AVAX]: [
    {
      address: '0xE9c2D66A1e23Db21D2c40552EC7fA3dFb91d0123', // JOE/USDC
      baseToken: '0xE9c2D66A1e23Db21D2c40552EC7fA3dFb91d0123', // USDC
      baseTokenDecimals: 6,
    },
    {
      address: '0xb2698B90BE455D617c0C5c1Bbc8Bc21Aa33F2Bbb', // AVAX/USDC
      baseToken: '0xE9c2D66A1e23Db21D2c40552EC7fA3dFb91d0123', // USDC
      baseTokenDecimals: 6,
    },
  ],
}

const abis = {
  positionChanged: 'event PositionChanged(address indexed trader, uint256 tradeFee, uint256 traderPayout, int256 previousAsset, int256 previousStable, int256 newAsset, int256 newStable)',
};

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const exchanges = exchangeConfigs[options.chain];

  const logs = await options.getLogs({
    targets: exchanges.map( i => i.address),
    eventAbi: abis.positionChanged,
    flatten: false,
  });

  for (let i = 0; i < exchanges.length; i++) {
    for (const log of logs[i]) {
      const amount = BigInt(log.tradeFee) * BigInt(10**exchanges[i].baseTokenDecimals) / BigInt(1e18);
      dailyFees.add(exchanges[i].baseToken, amount, METRIC.TRADING_FEES);
    }
  }

  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  };
};

const methodology = {
  Fees: 'Trading fees as reported by the tradeFee field in PositionChanged events. Futureswap is a leveraged derivatives protocol and does not emit explicit fee settlement events.',
  Revenue: 'All reported trade fees are treated as protocol revenue due to lack of on-chain fee distribution data.',
  ProtocolRevenue: 'Same as Revenue.',
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  adapter: {
    [CHAIN.ARBITRUM]: { start: '2021-10-13' },
    [CHAIN.AVAX]: { start: '2022-04-22' },
  },
  methodology,
  breakdownMethodology: {
    Fees: {
      [METRIC.TRADING_FEES]: 'Trading fees collected from the tradeFee field in PositionChanged events when users open, close, or modify leveraged positions.',
    },
  },
};

export default adapter;
