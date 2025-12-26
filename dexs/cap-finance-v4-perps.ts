import { FetchOptions, SimpleAdapter } from '../adapters/types';
import { CHAIN } from '../helpers/chains';

// TODO: Replace with actual Trade contract address that emits position events
const config: Record<string, string> = {
  [CHAIN.ARBITRUM]: '', // TODO: Find contract emitting PositionIncreased/PositionDecreased
  [CHAIN.BASE]: '', // TODO: Find Base Trade contract
};

const abis = {
  positionIncreased:
    'event PositionIncreased(uint256 indexed orderId, address indexed user, string market, bool isLong, uint256 size, uint256 margin, uint256 price, uint256 positionMargin, uint256 positionSize, uint256 positionPrice, int256 fundingTracker, uint256 fee, uint256 keeperFee)',
  positionDecreased:
    'event PositionDecreased(uint256 indexed orderId, address indexed user, string market, bool isLong, uint256 size, uint256 margin, uint256 price, uint256 positionMargin, uint256 positionSize, uint256 positionPrice, int256 fundingTracker, uint256 fee, uint256 keeperFee, int256 pnl, int256 fundingFee)',
};

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();

  const tradeContract = config[options.chain];

  const increaseLogs = await options.getLogs({
    target: tradeContract,
    eventAbi: abis.positionIncreased,
  });

  for (const log of increaseLogs) {
    const sizeUsd = Number(log.size) / 10 ** 18;
    dailyVolume.addUSDValue(sizeUsd);
  }

  const decreaseLogs = await options.getLogs({
    target: tradeContract,
    eventAbi: abis.positionDecreased,
  });

  for (const log of decreaseLogs) {
    const sizeUsd = Number(log.size) / 10 ** 18;
    dailyVolume.addUSDValue(sizeUsd);
  }

  return {
    dailyVolume,
  };
};

const methodology = {
  Volume:
    'Volume is derived from Trade contract position events using the notional USD `size` field.',
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch,
      start: '2024-01-01', // TODO: Find start date
    },
    [CHAIN.BASE]: {
      fetch,
      start: '2024-01-01', // TODO: Find start date
    },
  },
  methodology,
};

export default adapter;
