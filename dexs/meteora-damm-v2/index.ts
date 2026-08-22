import { CHAIN } from '../../helpers/chains';
import { httpGet } from '../../utils/fetchURL';
import { FetchOptions } from '../../adapters/types';
import { METRIC } from '../../helpers/metrics';
import { sleep } from '../../utils/utils';

// Previous API: https://cp-amm-api.meteora.ag/pools (with limit/offset support)
// Min pool fee is 0.25% so wash trading is not economically viable

const meteoraStatsEndpoint = 'https://damm-v2.datapi.meteora.ag/pools';
const REFERRAL_FEES = 'Referral Fees';

interface Pool {
  pages: number
  data: Array<{
    tvl: number
    is_blacklisted: boolean
    volume: { '24h': number }
    // fees['24h'] = LP fees only: lp_fee = total_swap_fee * (1 - protocol_fee_pct/100)
    fees: { '24h': number }
    // protocol_fees['24h'] = net protocol fees after referral deduction
    protocol_fees: { '24h': number }
    pool_config: { protocol_fee_pct: number }
  }>
}

async function fetch(options: FetchOptions) {
  let dailyVolume = 0;
  let totalFees = 0;
  let lpFees = 0;
  let protocolFees = 0;
  let referralFees = 0;

  let page = 1;
  const pageSize = 1000;

  while (true) {
    const response: Pool = await httpGet(`${meteoraStatsEndpoint}?is_blacklisted=false&page=${page}&page_size=${pageSize}`);

    const pools = response.data || [];
    if (pools.length === 0) break;

    for (const pool of pools) {
      // the is_blacklisted query param is not honored by the API, filter client-side
      if (pool.is_blacklisted) continue;

      const tvl = Number(pool.tvl ?? 0);
      const poolVolume = Number(pool.volume?.['24h'] ?? 0);
      const poolLpFees = Number(pool.fees?.['24h'] ?? 0);
      const poolProtocolFees = Number(pool.protocol_fees?.['24h'] ?? 0);

      // Ignore if TVL < 1M and volume > 10x TVL
      if (tvl < 1_000_000 && poolVolume > tvl * 10) continue;

      // fees['24h'] is the LP share only: lp_fee = total_swap_fee * (1 - protocol_fee_pct/100),
      // so gross swap fees = lp_fee / (1 - protocol_fee_pct/100)
      const protocolFeeRatio = Number(pool.pool_config?.protocol_fee_pct ?? 0) / 100;
      const poolTotalFees = protocolFeeRatio > 0 && protocolFeeRatio < 1
        ? poolLpFees / (1 - protocolFeeRatio)
        : poolLpFees + poolProtocolFees;

      // protocol_fees['24h'] is net of referral fees (up to 20% of the gross protocol fee
      // goes to the referral/host of the swap)
      const poolReferralFees = Math.max(poolTotalFees - poolLpFees - poolProtocolFees, 0);

      dailyVolume += poolVolume;
      totalFees += poolTotalFees;
      lpFees += poolLpFees;
      protocolFees += poolProtocolFees;
      referralFees += poolReferralFees;
    }

    if ([dailyVolume, totalFees, lpFees, protocolFees, referralFees].some(isNaN)) throw new Error('Invalid data from Meteora DAMM v2 API');

    if (page >= response.pages) break;

    await sleep(100)

    page++;
  }

  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  dailyFees.addUSDValue(totalFees, METRIC.SWAP_FEES);
  dailyRevenue.addUSDValue(protocolFees, METRIC.PROTOCOL_FEES);
  dailySupplySideRevenue.addUSDValue(lpFees, METRIC.LP_FEES);
  dailySupplySideRevenue.addUSDValue(referralFees, REFERRAL_FEES);

  return {
    dailyVolume,
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
  },
  methodology: {
    Volume: '24h swap volume across Meteora DAMM v2 pools, excluding blacklisted and likely wash-trading pools.',
    Fees: 'Gross swap fees paid by traders (LP fees + protocol fees + referral fees).',
    UserFees: 'Gross swap fees paid by traders, identical to Fees.',
    Revenue: 'Protocol share of swap fees, net of referral fees.',
    ProtocolRevenue: 'Protocol share of swap fees, net of referral fees, same as Revenue.',
    SupplySideRevenue: 'LP share of swap fees plus referral fees paid to swap hosts.',
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.SWAP_FEES]: 'Gross swap fees: LP fees grossed up by each pool\'s protocol_fee_pct.',
    },
    UserFees: {
      [METRIC.SWAP_FEES]: 'Gross swap fees paid by traders.',
    },
    Revenue: {
      [METRIC.PROTOCOL_FEES]: 'Net protocol fees (pool API protocol_fees[24h], after referral deduction).',
    },
    ProtocolRevenue: {
      [METRIC.PROTOCOL_FEES]: 'Net protocol fees retained by the protocol.',
    },
    SupplySideRevenue: {
      [METRIC.LP_FEES]: 'LP share of swap fees (pool API fees[24h]).',
      [REFERRAL_FEES]: 'Referral fees paid to swap hosts, inferred as gross fees − LP fees − net protocol fees.',
    },
  },
}
