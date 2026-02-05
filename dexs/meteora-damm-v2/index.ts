import { CHAIN } from '../../helpers/chains';
import { httpGet } from '../../utils/fetchURL';
import * as sdk from "@defillama/sdk";
import { sleep } from '../../utils/utils';

// Previous API: https://cp-amm-api.meteora.ag/pools (with limit/offset support)
// Min pool fee is 0.25% so wash trading is not economically viable

async function fetch() {
  const baseUrl = 'https://damm-v2.datapi.meteora.ag/pools/groups';
  const allPoolsUrl = 'https://dammv2-api.meteora.ag/pools';

  const nonBlacklistedPools = new Set();

  let page = 1;
  let totalVolume = 0;
  const pageSize = 99;

  while (true) {
    const response = await httpGet(`${baseUrl}?page=${page}&page_size=${pageSize}&sort_by=tvl%3Adesc&filter_by=is_blacklisted%3A%3Dfalse&fee_tvl_ratio_tw=fee_tvl_ratio_24h&volume_tw=volume_24h`);
    
    const pools = response.data || [];
    if (pools.length === 0) break;
    
    const lastPool = pools[pools.length - 1];
    if (lastPool.total_tvl < 1000) break;
    
    for (const pool of pools) {
      const tvl = pool.total_tvl || 0;
      const volume = pool.total_volume || 0;

      nonBlacklistedPools.add(pool.group_name)

      // Ignore if TVL < 1M and volume > 10x TVL
      if (tvl < 1_000_000 && volume > tvl * 10) {
        continue;
      }
      
      totalVolume += volume;
    }

    await sleep(100)
    
    page++;
  }

  try {
    let dailySupplySideRevenue = 0; // LP fees
    let dailyRevenue = 0;

    let offset = 0;
    const lpFeeRatio = 0.8;

    while (true) {
      const response = await httpGet(`${allPoolsUrl}?order_by=fee24h&order=desc&offset=${offset}`);

      const pools = response.data || [];
      if (pools.length === 0) break;

      for (const pool of pools) {
        const tvl = pool.tvl || 0;
        const volume = pool.volume24h || 0;

        if (!nonBlacklistedPools.has(pool.pool_name) || (tvl < 1_000_000 && volume > tvl * 10))
          continue;
        dailySupplySideRevenue += (lpFeeRatio * pool.fee24h);
        dailyRevenue += ((1 - lpFeeRatio) * pool.fee24h)
      }

      const lastPool = pools[pools.length - 1];
      if (lastPool.fee24h < 10) break;

      await sleep(100)

      offset += 50;
    }

    // Total fees paid by users
    const dailyFees = dailySupplySideRevenue + dailyRevenue;

    if (isNaN(totalVolume) || isNaN(dailyFees)) {
      throw new Error('Invalid daily volume or fees from global metrics');
    }

    return {
      dailyVolume: totalVolume,
      dailyFees,
      dailyUserFees: dailyFees,
      dailyRevenue,
      dailySupplySideRevenue,
    };
    
  } catch (error) {
    sdk.log(`Error fetching global metrics: ${error}`);
    throw error;
  }
}

export default {
  version: 2,
  adapter: {
    [CHAIN.SOLANA]: {
      fetch,
      runAtCurrTime: true,
      start: '2025-04-18'
    }
  }
}
