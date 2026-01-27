import { EventFragment, id, zeroPadValue } from 'ethers';
import { FetchOptions, SimpleAdapter } from '../../adapters/types';
import { getConfig } from '../../helpers/cache';
import { CHAIN } from '../../helpers/chains';

const STRATEGIES_URL = 'https://raw.githubusercontent.com/Lynexfi/lynex-lists/main/strategies/main.json';
const POOLMANAGER = '0x67366782805870060151383f4bbff9dab53e5cd6'; // Uniswap v4 PoolManager on Polygon
const MODIFY_LIQUIDITY_EVENT = 'event ModifyLiquidity(bytes32 indexed poolId, address indexed sender, int256 liquidityDelta, uint256 amount0, uint256 amount1, uint256 feesAccrued0, uint256 feesAccrued1)';

async function getCatexStrategies() {
  const data = await getConfig('catex', STRATEGIES_URL);
  // Get only Polygon (137) strategies
  const polygonStrategies = data['137'] || [];
  // Filter for uniV4 strategies only since Catex only manages V4 pools
  return polygonStrategies.filter(strategy => strategy.variant === 'uniV4');
}

const fetchFees = async (options: FetchOptions) => {
  const strategies = await getCatexStrategies();
  const eventAbiTopic = id(EventFragment.from(MODIFY_LIQUIDITY_EVENT).format());
  const dailyFees = options.createBalances();

  for (const strategy of strategies) {
    const { address: strategyAddress, v4PoolId, token0, token1 } = strategy;
    // Get ModifyLiquidity events for this poolId where the strategy is the sender
    const logs = await options.getLogs({
      target: POOLMANAGER,
      eventAbi: MODIFY_LIQUIDITY_EVENT,
      topics: [eventAbiTopic, v4PoolId, zeroPadValue(strategyAddress, 32)],
    });
    for (const log of logs) {
      // Only count fees if the strategy is the one collecting them
      if (log.sender.toLowerCase() === strategyAddress.toLowerCase()) {
        dailyFees.add(token0.address, log.feesAccrued0);
        dailyFees.add(token1.address, log.feesAccrued1);
      }
    }
  }

  return { dailyFees, };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.POLYGON]: {
      fetch: fetchFees,
      start: '2024-03-24', // Mar-24-2025 07:43:44 PM UTC
    },
  },
};

export default adapter;
