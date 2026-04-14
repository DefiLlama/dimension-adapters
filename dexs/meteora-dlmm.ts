import { CHAIN } from '../helpers/chains';
import fetchURL from '../utils/fetchURL';
import { sleep } from '../utils/utils';

const meteoraStatsEndpoint = 'https://dlmm.datapi.meteora.ag/pools';

async function fetch() {
  let page = 1;
  let dailyVolume = 0;
  let dailyFees = 0;
  let dailyRevenue = 0;
  let dailySupplySideRevenue = 0;
  const limit = 100;

  while (true) {
    const response = await fetchURL(`${meteoraStatsEndpoint}?page=${page}&limit=${limit}`);

    const pools = response.data || [];
    if (pools.length === 0) break;

    for (const pool of pools) {
      const tvl = pool.tvl || 0;
      const volume = (pool.volume && pool.volume['24h']) ? Number(pool.volume['24h']) : 0;
      // const protocolFeeRatio = +pool.pool_config.protocol_fee_percentage / 100 || 0;
      const fees = (pool.fees && pool.fees['24h']) ? Number(pool.fees['24h']) : 0;
      const protocol_fees = (pool.protocol_fees && pool.protocol_fees['24h']) ? Number(pool.protocol_fees['24h']) : 0;

      // Ignore if TVL < 1M and volume > 10x TVL
      if (pool.is_blacklisted || (tvl < 1_000_000 && volume > tvl * 10))
        continue;

      dailyVolume += volume;
      dailyFees += fees;
      dailyRevenue += protocol_fees;
      dailySupplySideRevenue += fees - protocol_fees;
    }

    const lastPool = pools[pools.length - 1];
    if (lastPool.volume['24h'] < 1000) break;

    await sleep(100)

    page++;
  }

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  }
}

export default {
  version: 2,
  adapter: {
    [CHAIN.SOLANA]: {
      fetch,
      runAtCurrTime: true,
      start: '2023-11-07'
    }
  }
}
