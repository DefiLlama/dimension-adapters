import { CHAIN } from '../../helpers/chains';
import { httpGet } from '../../utils/fetchURL';
import { sleep } from '../../utils/utils';

// Previous API: https://cp-amm-api.meteora.ag/pools (with limit/offset support)
// Min pool fee is 0.25% so wash trading is not economically viable

async function fetch() {
  const baseUrl = 'https://damm-v2.datapi.meteora.ag/pools';

  let page = 1;

  let dailyVolume = 0;
  let dailyFees = 0;
  let dailyRevenue = 0;
  let dailySupplySideRevenue = 0; // LP fees
  
  const pageSize = 1000;

  while (true) {
    const response = await httpGet(`${baseUrl}?is_blacklisted=false&page=${page}&page_size=${pageSize}`);
    
    const pools = response.data || [];
    if (pools.length === 0) break;

    for (const pool of pools) {
      const tvl = pool.tvl || 0;
      const volume = pool.volume['24h'] || 0;

      // Ignore if TVL < 1M and volume > 10x TVL
      if (tvl < 1_000_000 && volume > tvl * 10) {
        continue;
      }

      dailyVolume += volume;

      const fees = pool.fees['24h'] || 0;
      const protocolFees = pool.protocol_fees['24h'] || 0;
      const supplySideFees = fees - protocolFees;
      
      dailyFees += fees
      dailyRevenue += protocolFees
      dailySupplySideRevenue += supplySideFees
    }

    await sleep(100)
    
    page++;
  }
  
  return {
    dailyVolume: dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
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
