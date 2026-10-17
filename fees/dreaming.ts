import { FetchOptions, SimpleAdapter } from '../adapters/types';
import { CHAIN } from '../helpers/chains';
import { httpGet, httpPost } from '../utils/fetchURL';

const BUILDER_REFERRAL_FEES = 'Builder Referral Fees';

function referralIncome(value: unknown, field: string): number {
  if (typeof value !== 'string' || !/^\d+(\.\d+)?$/.test(value) || !Number.isFinite(Number(value)))
    throw new Error(`Invalid Derive ${field}`);
  return Number(value);
}

async function fetchBuilderReferrals(options: FetchOptions) {
  const { result, error } = options.chain === CHAIN.DERIVE_V3
    ? await httpPost('https://api.derive.xyz/v3/public/get_referral_performance', {
      referral_code: 'dream',
      start_ms: options.fromTimestamp * 1000,
      end_ms: options.toTimestamp * 1000,
    })
    : await httpGet(`https://api.lyra.finance/public/get_referral_performance?start_ms=${options.fromTimestamp * 1000}&end_ms=${options.toTimestamp * 1000}&referral_code=dream`);
  if (error) throw new Error(`Derive referral performance: ${JSON.stringify(error)}`);
  // Builder fees are paid to Dream in addition to its referral rewards; referred fees belong to the venue.
  // https://docs.derive.xyz/integrators/programs/builder-fees
  const fees = referralIncome(result?.total_builder_fee_collected, 'total_builder_fee_collected')
    + referralIncome(result?.total_fee_rewards, 'total_fee_rewards');

  const dailyFees = options.createBalances();
  dailyFees.addUSDValue(fees, BUILDER_REFERRAL_FEES);

  return {
    dailyFees,
    dailyRevenue: dailyFees.clone(1, BUILDER_REFERRAL_FEES),
    dailyProtocolRevenue: dailyFees.clone(1, BUILDER_REFERRAL_FEES),
  }
}

const adapter: SimpleAdapter = {
  version: 1,
  adapter: {
    [CHAIN.LYRA]: { fetch: fetchBuilderReferrals, start: '2025-11-29', deadFrom: '2026-10-05' }, // that venue's chain shut down with its v3 cutover
    [CHAIN.DERIVE_V3]: { fetch: fetchBuilderReferrals, start: '2026-10-06' },
  },
  methodology: {
    Fees: 'Builder fees and referral rewards earned by Dream on Derive.',
    Revenue: 'All builder fees and referral rewards are revenue to Dream.',
    ProtocolRevenue: 'All builder fees and referral rewards are retained by Dream.',
  },
  breakdownMethodology: {
    Fees: {
      [BUILDER_REFERRAL_FEES]: 'Builder fees and referral rewards earned by Dream on Derive.',
    },
    Revenue: {
      [BUILDER_REFERRAL_FEES]: 'Builder fees and referral rewards, all earned by Dream.',
    },
    ProtocolRevenue: {
      [BUILDER_REFERRAL_FEES]: 'Builder fees and referral rewards, all earned by Dream.',
    },
  },
}

export default adapter;
