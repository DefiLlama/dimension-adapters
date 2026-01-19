import { CHAIN } from '../../helpers/chains';
import { httpGet } from '../../utils/fetchURL';
import * as sdk from "@defillama/sdk";
import { sleep } from '../../utils/utils';

// Previous API: https://cp-amm-api.meteora.ag/pools (with limit/offset support)
// Min pool fee is 0.25% so wash trading is not economically viable

const meteoraGlobalMetricsEndpoint = 'https://dammv2-api.meteora.ag/pools/global-metrics';

async function fetch() {
  const baseUrl = 'https://damm-v2.datapi.meteora.ag/pools/groups';
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
    const response = await httpGet(meteoraGlobalMetricsEndpoint);
    
    const dailyVolume = response.data.volume24h || 0;
    const dailySupplySideRevenue = response.data.lp_fee24h || 0; // LP fees
    const dailyProtocolRevenue = response.data.protocol_fee24h || 0; // Protocol fees
    const dailyPartnerRevenue = response.data.partner_fee24h || 0; // Partner fees
    const dailyReferralRevenue = response.data.referral_fee24h || 0; // Referral fees

    // Total fees paid by users
    const dailyFees = dailySupplySideRevenue + dailyProtocolRevenue + dailyPartnerRevenue + dailyReferralRevenue;
    
    // Total revenue = Protocol + Partner + Referral (excluding LP fees)
    const dailyRevenue = dailyProtocolRevenue + dailyPartnerRevenue + dailyReferralRevenue;
    
    if (isNaN(dailyVolume) || isNaN(dailyFees)) {
      throw new Error('Invalid daily volume or fees from global metrics');
    }

    return {
      dailyVolume: totalVolume,
      dailyFees,
      dailyUserFees: dailyFees,
      dailyRevenue,
      dailyProtocolRevenue,
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
