import { FetchOptions, SimpleAdapter } from '../../adapters/types';
import { CHAIN } from '../../helpers/chains';
import { getConfig } from '../../helpers/cache';
import { EventFragment, id, zeroPadValue } from 'ethers';

const STRATEGIES_URL = 'https://raw.githubusercontent.com/Lynexfi/lynex-lists/main/strategies/main.json';
const POOLMANAGER = '0x67366782805870060151383f4bbff9dab53e5cd6'; // Uniswap v4 PoolManager on Polygon
const COLLECT_EVENT = 'event Collect(bytes32 indexed poolId, address indexed recipient, uint256 amount0, uint256 amount1)';

async function getCatexStrategies() {
  const data = await getConfig('catex', STRATEGIES_URL);
  // Get only Polygon (137) strategies
  const polygonStrategies = data['137'] || [];
  // Filter for uniV4 strategies only since Catex only manages V4 pools
  return polygonStrategies.filter(strategy => strategy.variant === 'uniV4');
}

const fetchFees = async (options: FetchOptions) => {
  const strategies = await getCatexStrategies();
  const eventAbiTopic = id(EventFragment.from(COLLECT_EVENT).format());
  const dailyFees = options.createBalances();

  for (const strategy of strategies) {
    const { address: strategyAddress, v4PoolId, token0, token1 } = strategy;
    // Get Collect events for this poolId and strategy address
    const logs = await options.getLogs({
      target: POOLMANAGER,
      eventAbi: COLLECT_EVENT,
      topics: [eventAbiTopic, v4PoolId, zeroPadValue(strategyAddress, 32)],
    });
    for (const log of logs) {
      dailyFees.add(token0.address, log.amount0);
      dailyFees.add(token1.address, log.amount1);
    }
  }

  return { dailyFees, };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.POLYGON]: {
      fetch: fetchFees,
      start: 1711309424, // Mar-24-2025 07:43:44 PM UTC
    },
  },
};

export default adapter;
