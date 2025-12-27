import { Address } from '@defillama/sdk/build/types';
import { FetchOptions, SimpleAdapter } from '../adapters/types';
import { CHAIN } from '../helpers/chains';

const config: Record<string, { trades: Address[] }> = {
  [CHAIN.ARBITRUM]: {
    trades: [
      '0xbE4A45BDdFC9e0647FbA313a2bD96B6De8B65C15',
      '0x26396Ffd65e2d89Ce853CC4076Df20272Fc69E5A',
      '0x08b1d6fE01660911b939e9c896Ab53aBa231F101',
    ],
  },
};

const abis = {
  positionIncreased:
    'event PositionIncreased(uint256 indexed orderId, address indexed user, string market, bool isLong, uint256 size, uint256 margin, uint256 price, uint256 positionMargin, uint256 positionSize, uint256 positionPrice, int256 fundingTracker, uint256 fee, uint256 keeperFee)',
  positionDecreased:
    'event PositionDecreased(uint256 indexed orderId, address indexed user, string market, bool isLong, uint256 size, uint256 margin, uint256 price, uint256 positionMargin, uint256 positionSize, uint256 positionPrice, int256 fundingTracker, uint256 fee, uint256 keeperFee, int256 pnl, int256 fundingFee)',
};

const fetch = async (options: FetchOptions) => {
  const chainConfig = config[options.chain];
  const dailyVolume = options.createBalances();

  const allLogs = await Promise.all(
    chainConfig.trades.flatMap((tradeContract: Address) => [
      options.getLogs({
        target: tradeContract,
        eventAbi: abis.positionIncreased,
      }),
      options.getLogs({
        target: tradeContract,
        eventAbi: abis.positionDecreased,
      }),
    ])
  );

  for (const logs of allLogs) {
    for (const log of logs) {
      const sizeUsd = Number(log.size.toString()) / 1e8;
      dailyVolume.addUSDValue(sizeUsd);
    }
  }

  return {
    dailyVolume,
  };
};

const methodology = {
  Volume: 'Daily volume represents the total USD value traded.',
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch,
      start: '2023-02-19',
    },
  },
  methodology,
};

export default adapter;
