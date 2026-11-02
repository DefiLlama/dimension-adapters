import { Balances } from '@defillama/sdk';
import { FetchOptions, SimpleAdapter } from '../../adapters/types';
import { filterPools } from '../../helpers/uniswap';
import { products, stexAdapter } from '../../helpers/valantis';

// Retain the live listing's factory discovery and pre-STEX pool history.
const FACTORY = '0x7E028ac56cB2AF75292F3D967978189698C24732';
const FACTORY_FROM_BLOCK = 1588292;
const metrics = ['dailyVolume', 'dailyFees', 'dailyUserFees', 'dailyRevenue', 'dailyProtocolRevenue', 'dailySupplySideRevenue'] as const;

const fetch = async (options: FetchOptions) => {
  const totals = Object.fromEntries(metrics.map(metric => [metric, options.createBalances()])) as Record<typeof metrics[number], Balances>;
  const deployments = await options.getLogs({
    target: FACTORY,
    eventAbi: 'event SovereignPoolDeployed(address indexed token0,address indexed token1,address pool)',
    fromBlock: FACTORY_FROM_BLOCK,
    cacheInCloud: true,
    onlyArgs: false,
  });
  const currentPools = new Set(Object.values(products).map(product => product.pool.toLowerCase()));
  const legacy = deployments.filter(log => !currentPools.has(log.args.pool.toLowerCase()));
  const pairs = Object.fromEntries(legacy.map(log => [log.args.pool.toLowerCase(), [log.args.token0, log.args.token1]]));
  // Keep the existing pricing/liquidity filter for other factory pools.
  const filtered = legacy.length ? await filterPools({ api: options.api, pairs, createBalances: options.createBalances }) : {};
  const legacyPools = legacy.filter(log => Object.hasOwn(filtered, log.args.pool.toLowerCase())).map(log => ({
    stex: '', // Only the two verified STEX AMMs have LP-withdrawal accounting.
    pool: log.args.pool,
    token0: log.args.token0,
    token1: log.args.token1,
    block: Number(log.blockNumber),
    managerFeeStartBlock: 0,
    start: '2025-03-27',
  }));
  for (const product of [...Object.values(products), ...legacyPools]) {
    const result = await stexAdapter(product).fetch!(options);
    for (const metric of metrics) totals[metric].addBalances(result[metric] as Balances);
  }
  return totals;
};

const adapter: SimpleAdapter = {
  ...stexAdapter(products.sthype),
  start: '2025-03-27', // Preserve the existing combined listing's start.
  fetch,
};

export default adapter;
