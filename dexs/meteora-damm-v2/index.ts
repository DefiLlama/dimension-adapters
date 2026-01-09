import { CHAIN } from '../../helpers/chains';
import { httpGet } from '../../utils/fetchURL';
import * as sdk from "@defillama/sdk";

// Previous API: https://cp-amm-api.meteora.ag/pools (with limit/offset support)
// Min pool fee is 0.25% so wash trading is not economically viable

const meteoraGlobalMetricsEndpoint = 'https://dammv2-api.meteora.ag/pools/global-metrics';

async function fetch() {
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
      dailyVolume,
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
