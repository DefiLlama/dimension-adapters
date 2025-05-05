import { FetchOptions, SimpleAdapter } from '../../adapters/types';
import { CHAIN } from '../../helpers/chains';
import fetchURL from '../../utils/fetchURL';

const STRATEGIES_URL = 'https://raw.githubusercontent.com/Lynexfi/lynex-lists/main/strategies/main.json';
const POOLMANAGER = '0x67366782805870060151383f4bbff9dab53e5cd6'; // Uniswap v4 PoolManager on Polygon
const MODIFY_LIQUIDITY_EVENT = 'event ModifyLiquidity(bytes32 indexed poolId, address indexed sender, int256 liquidityDelta, uint256 amount0, uint256 amount1, uint256 feesAccrued0, uint256 feesAccrued1)';

async function getCatexStrategies() {
  const data = await fetchURL(STRATEGIES_URL);
  // Get only Polygon (137) strategies
  const polygonStrategies = data['137'] || [];
  // Filter for uniV4 strategies only since Catex only manages V4 pools
  return polygonStrategies.filter(strategy => strategy.variant === 'uniV4');
}

const fetchFees = async (timestamp: number, _chainBlocks: any, options: FetchOptions) => {
  const dayTimestamp = Math.floor(timestamp / 86400) * 86400;
  const strategies = await getCatexStrategies();
  const dailyFees = options.createBalances();

  for (const strategy of strategies) {
    const { address: strategyAddress, v4PoolId, token0, token1 } = strategy;
    // Get ModifyLiquidity events for this poolId and strategy address
    const logs = await options.getLogs({
      target: POOLMANAGER,
      eventAbi: MODIFY_LIQUIDITY_EVENT,
      topics: [v4PoolId, strategyAddress],
    });
    for (const log of logs) {
      dailyFees.add(token0.address, log.feesAccrued0);
      dailyFees.add(token1.address, log.feesAccrued1);
    }
  }

  return {
    timestamp: dayTimestamp,
    dailyFees: (await dailyFees.getUSDValue()).toString(),
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.POLYGON]: {
      fetch: fetchFees,
      start: 1711309424, // Mar-24-2025 07:43:44 PM UTC
    },
  },
};

export default adapter;
