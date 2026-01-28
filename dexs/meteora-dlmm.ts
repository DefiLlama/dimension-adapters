import { CHAIN } from '../helpers/chains';
import fetchURL from '../utils/fetchURL';
import { sleep } from '../utils/utils';

const meteoraStatsEndpoint = 'https://dlmm-api.meteora.ag/pair/all_with_pagination';

async function fetch() {
  let page = 1;
  let dailyVolume = 0;
  let dailyRevenue = 0;
  let dailySupplySideRevenue = 0;
  const limit = 100;

  while (true) {
    const response = await fetchURL(`${meteoraStatsEndpoint}?page=${page}&limit=${limit}`);

    const pools = response.pairs || [];
    if (pools.length === 0) break;

    for (const pool of pools) {
      const tvl = pool.liquidity || 0;
      const volume = pool.trade_volume_24h || 0;
      const protocolFeeRatio = +pool.protocol_fee_percentage / 100 || 0;
      const fees = pool.fees_24h;

      // Ignore if TVL < 1M and volume > 10x TVL
      if (pool.is_blacklisted || (tvl < 1_000_000 && volume > tvl * 10))
        continue;

      dailyVolume += volume;
      dailyRevenue += fees * protocolFeeRatio;
      dailySupplySideRevenue += fees * (1 - protocolFeeRatio);
    }

    const lastPool = pools[pools.length - 1];
    if (lastPool.trade_volume_24h < 1000) break;

    await sleep(100)

    page++;
  }
  const dailyFees = dailySupplySideRevenue + dailyRevenue;

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue,
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
