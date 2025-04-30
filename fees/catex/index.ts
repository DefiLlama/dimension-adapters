import { FetchOptions, SimpleAdapter } from '../../adapters/types';
import { CHAIN } from '../../helpers/chains';
import { getBlock } from '../../helpers/getBlock';
import fetchURL from '../../utils/fetchURL';
import { getPrices } from '../../utils/prices';

const STRATEGIES_URL = 'https://raw.githubusercontent.com/Lynexfi/lynex-lists/main/strategies/main.json';
const POOLMANAGER = '0x67366782805870060151383f4bbff9dab53e5cd6'; // Uniswap v4 PoolManager on Polygon
const COLLECT_EVENT = 'event Collect(bytes32 indexed poolId, address indexed recipient, uint256 amount0, uint256 amount1)';

async function getCatexStrategies() {
  const data = await fetchURL(STRATEGIES_URL);
  // Get only Polygon (137) strategies
  const polygonStrategies = data['137'] || [];
  // Filter for uniV4 strategies only since Catex only manages V4 pools
  return polygonStrategies.filter(strategy => strategy.variant === 'uniV4');
}

const fetchFees = async (timestamp: number, chainBlocks: any, { api, getLogs }: FetchOptions) => {
  const dayTimestamp = Math.floor(timestamp / 86400) * 86400;
  const strategies = await getCatexStrategies();

  // Get yesterday's and today's block
  const yesterdayTimestamp = dayTimestamp - 24 * 60 * 60;
  const yesterdayBlock = await getBlock(yesterdayTimestamp, CHAIN.POLYGON, chainBlocks);
  const todayBlock = chainBlocks.polygon;

  let dailyFeeUsd = 0;

  for (const strategy of strategies) {
    const { address: strategyAddress, v4PoolId, token0, token1 } = strategy;
    // Get Collect events for this poolId and strategy address
    const logs = await getLogs({
      target: POOLMANAGER,
      eventAbi: COLLECT_EVENT,
      fromBlock: yesterdayBlock,
      toBlock: todayBlock,
      topics: [v4PoolId, strategyAddress],
    });
    let total0 = 0n, total1 = 0n;
    for (const log of logs) {
      total0 += BigInt(log.amount0);
      total1 += BigInt(log.amount1);
    }
    // Get token prices at the day's timestamp
    const prices = await getPrices([token0.address, token1.address], dayTimestamp);
    const price0 = prices[token0.address]?.price ?? 0;
    const price1 = prices[token1.address]?.price ?? 0;
    const feeUsd0 = Number(total0) / 1e18 * price0;
    const feeUsd1 = Number(total1) / 1e18 * price1;
    dailyFeeUsd += feeUsd0 + feeUsd1;
  }

  return {
    timestamp: dayTimestamp,
    dailyFees: dailyFeeUsd.toString(),
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
