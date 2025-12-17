import { FetchOptions, SimpleAdapter } from '../adapters/types';
import { CHAIN } from '../helpers/chains';

// Exchange contracts for Futureswap
// Source: https://docs.futureswap.com/protocol/developer/addresses-abis-and-links
const config: any = {
  [CHAIN.ARBITRUM]: {
    exchanges: [
      '0xF7CA7384cc6619866749955065f17beDD3ED80bC', // ETH/USDC
      '0x85DDE4A11cF366Fb56e05cafE2579E7119D5bC2f', // WBTC/ETH
    ],
  },
  [CHAIN.AVAX]: {
    exchanges: [
      '0xE9c2D66A1e23Db21D2c40552EC7fA3dFb91d0123', // JOE/USDC
      '0xb2698B90BE455D617c0C5c1Bbc8Bc21Aa33F2Bbb', // WAVAX/USDC
    ],
  },
};

const abis = {
  // Source: https://docs.futureswap.com/protocol/developer/events
  PositionChanged:
    'event PositionChanged(address indexed trader, uint256 tradeFee, uint256 traderPayout, int256 previousAsset, int256 previousStable, int256 newAsset, int256 newStable)',
};

const fetch = async (options: FetchOptions) => {
  const { chain, createBalances, getLogs } = options;
  const dailyVolume = createBalances();

  const exchanges = config[chain]?.exchanges;

  if (!exchanges) {
    return { dailyVolume };
  }

  const logs = await Promise.all(
    exchanges.map((exchange: string) =>
      getLogs({
        target: exchange,
        eventAbi: abis.PositionChanged,
      })
    )
  );

  // Process all logs to calculate volume
  logs.flat().forEach((log: any) => {
    // Calculate volume from position change
    const volumeChange = Math.abs(
      Number(log.newStable) - Number(log.previousStable)
    );

    const USDC =
      chain === CHAIN.ARBITRUM
        ? '0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8' // Arbitrum USDC
        : '0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E'; // Avalanche USDC

    dailyVolume.add(USDC, volumeChange);
  });

  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch,
      start: '2021-10-13',
    },
    [CHAIN.AVAX]: {
      fetch,
      start: '2022-04-22',
    },
  },
};

export default adapter;
