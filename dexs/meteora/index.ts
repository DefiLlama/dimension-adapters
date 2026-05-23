import { CHAIN } from '../../helpers/chains';
import { httpGet } from '../../utils/fetchURL';
import { FetchOptions } from '../../adapters/types';
import { sleep } from '../../utils/utils';
import { METRIC } from '../../helpers/metrics';

const meteoraStatsEndpoint = 'https://damm-api.meteora.ag/pools/search';
const LP_AND_HOST_FEES = 'LP and Host Fees';

// Docs: standard constant-product and launch pools → 80% LP / 20% protocol.
// Stable swap pools → 100% LP / 0% protocol.
// Source: https://docs.meteora.ag/overview/products/damm-v1/damm-v1-fee-and-apy-calculation
const STANDARD_POOL_PROTOCOL_FEE_RATIO = 0.2;

function getProtocolFeeRatio(poolType?: string) {
  return poolType === 'stable' ? 0 : STANDARD_POOL_PROTOCOL_FEE_RATIO;
}

interface Pool {
  total_count: number
  data: Array<{
    trading_volume: number
    fee_volume: number
    pool_type?: string
    tvl?: number
  }>
}

async function fetch(options: FetchOptions) {
  let dailyVolume = 0;
  let totalFees = 0;
  let protocolFees = 0;
  let nonProtocolFees = 0;

  let page = 0;
  const limit = 300;
  while (true) {
    const response: Pool = (await httpGet(`${meteoraStatsEndpoint}?page=${page}&size=${limit}&hide_low_tvl=10000`));

    const pools = response.data;
    if (pools.length === 0) break;
    for (const pool of pools) {
      const poolVolume = Number(pool.trading_volume ?? 0);
      const poolFees = Number(pool.fee_volume ?? 0);
      const tvl = Number(pool.tvl ?? 0);

      // Exclude likely wash-trading pools: high volume relative to TVL
      if (tvl > 0 && tvl < 1_000_000 && poolVolume > tvl * 10) continue;

      const poolProtocolFees = poolFees * getProtocolFeeRatio(pool.pool_type);

      dailyVolume += poolVolume;
      totalFees += poolFees;
      protocolFees += poolProtocolFees;
      nonProtocolFees += poolFees - poolProtocolFees;
    }

    if ([dailyVolume, totalFees, protocolFees, nonProtocolFees].some(isNaN)) throw new Error('Invalid data from Meteora DAMM v1 API');

    await sleep(100);

    page += 1;
  }

  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  dailyFees.addUSDValue(totalFees, METRIC.SWAP_FEES);
  dailyRevenue.addUSDValue(protocolFees, METRIC.PROTOCOL_FEES);
  dailyProtocolRevenue.addUSDValue(protocolFees, METRIC.PROTOCOL_FEES);
  dailySupplySideRevenue.addUSDValue(nonProtocolFees, LP_AND_HOST_FEES);

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailySupplySideRevenue,
  }
}

export default {
  version: 2,
  adapter: {
    [CHAIN.SOLANA]: {
      fetch,
      runAtCurrTime: true,
      start: '2024-04-30', // Apr 30 2024 - 00:00:00 UTC
    }
  },
  methodology: {
    Volume: 'Daily swap volume from Meteora DAMM v1 pools.',
    Fees: 'Total swap fees paid by users.',
    UserFees: 'Total swap fees paid by users, identical to Fees.',
    Revenue: 'Protocol share of DAMM v1 swap fees.',
    ProtocolRevenue: 'Protocol share of DAMM v1 swap fees, same as Revenue.',
    SupplySideRevenue: 'LP share of swap fees.',
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.SWAP_FEES]: 'Gross swap fees from pool fee_volume (constant-product + stable-swap pools).',
    },
    UserFees: {
      [METRIC.SWAP_FEES]: 'Gross swap fees from pool fee_volume.',
    },
    Revenue: {
      [METRIC.PROTOCOL_FEES]: 'Protocol share: 20% of fee_volume for constant-product/launch pools, 0% for stable-swap pools.',
    },
    ProtocolRevenue: {
      [METRIC.PROTOCOL_FEES]: 'Protocol share: 20% for constant-product/launch, 0% for stable-swap.',
    },
    SupplySideRevenue: {
      [LP_AND_HOST_FEES]: '80% of fee_volume for constant-product/launch pools (100% for stable-swap), including any DAMM v1 host fees.',
    },
  },
}
