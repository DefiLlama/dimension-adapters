import { FetchOptions, SimpleAdapter } from '../../adapters/types';
import { CHAIN } from '../../helpers/chains';
import { getBlock } from '../../helpers/getBlock';
import fetchURL from '../../utils/fetchURL';
import { getPrices } from '../../utils/prices';

const STRATEGIES_URL = 'https://raw.githubusercontent.com/Lynexfi/lynex-lists/main/strategies/main.json';
const GET_TOTAL_AMOUNTS_ABI = 'function getTotalAmounts() view returns (uint256 total0, uint256 total1, uint256 totalFee0, uint256 totalFee1)';
const TOKEN0_ABI = 'function token0() view returns (address)';
const TOKEN1_ABI = 'function token1() view returns (address)';

async function getCatexPools() {
  const data = await fetchURL(STRATEGIES_URL);
  // Get only Polygon (137) strategies
  const polygonStrategies = data['137'] || [];
  // Filter for uniV4 strategies only since Catex only manages V4 pools
  const pools = polygonStrategies
    .filter(strategy => strategy.variant === 'uniV4')
    .map(strategy => strategy.address);
  return pools;
}

const fetchFees = async (timestamp: number, chainBlocks: any, { api }: FetchOptions) => {
  const dayTimestamp = Math.floor(timestamp / 86400) * 86400;
  const pools = await getCatexPools();

  // Get yesterday's and today's block
  const yesterdayTimestamp = dayTimestamp - 24 * 60 * 60;
  const yesterdayBlock = await getBlock(yesterdayTimestamp, CHAIN.POLYGON, chainBlocks);
  const todayBlock = chainBlocks.polygon;

  let dailyFeeUsd = 0;

  for (const pool of pools) {
    // Get token addresses
    const [token0, token1] = await Promise.all([
      api.call({ target: pool, abi: TOKEN0_ABI }),
      api.call({ target: pool, abi: TOKEN1_ABI })
    ]);

    // Get fees at start and end of day
    const [start, end] = await Promise.all([
      api.call({ target: pool, abi: GET_TOTAL_AMOUNTS_ABI, block: yesterdayBlock }),
      api.call({ target: pool, abi: GET_TOTAL_AMOUNTS_ABI, block: todayBlock })
    ]);

    const dailyFee0 = BigInt(end.totalFee0) - BigInt(start.totalFee0);
    const dailyFee1 = BigInt(end.totalFee1) - BigInt(start.totalFee1);

    // Get token prices at the day's timestamp
    const prices = await getPrices([token0, token1], dayTimestamp);
    const price0 = prices[token0]?.price ?? 0;
    const price1 = prices[token1]?.price ?? 0;

    // Debug logs
    console.log('Pool:', pool);
    console.log('Token0:', token0, 'Token1:', token1);
    console.log('Start:', start);
    console.log('End:', end);
    console.log('DailyFee0:', dailyFee0.toString(), 'DailyFee1:', dailyFee1.toString());
    console.log('Price0:', price0, 'Price1:', price1);

    const feeUsd0 = Number(dailyFee0) / 1e18 * price0;
    const feeUsd1 = Number(dailyFee1) / 1e18 * price1;
    console.log('FeeUsd0:', feeUsd0, 'FeeUsd1:', feeUsd1);
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
