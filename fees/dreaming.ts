import { FetchOptions, SimpleAdapter } from '../adapters/types';
import { CHAIN } from '../helpers/chains';
import fetchURL, { httpGet } from '../utils/fetchURL';

// Dream's public daily stats, one finished UTC day per call, shared with options/dreaming.ts
export const fetchDreamDailyStats = (options: FetchOptions) =>
  fetchURL(`https://api.dos.app/public/defillama/daily?date=${options.dateString}`);

const BUILDER_REFERRAL_FEES = 'Builder Referral Fees';
const OPTION_TRADING_FEES = 'Option Trading Fees';
const REFERRAL_PAYOUTS = 'Referral Payouts';

function referralIncome(value: unknown, field: string): number {
  if (typeof value !== 'string' || !/^\d+(\.\d+)?$/.test(value) || !Number.isFinite(Number(value)))
    throw new Error(`Invalid Derive ${field}`);
  return Number(value);
}

// Keep the legacy venue series through its shutdown, including after the RFQ brokerage launched.
async function fetchBuilderReferrals(options: FetchOptions) {
  const { result } = await httpGet(`https://api.lyra.finance/public/get_referral_performance?start_ms=${options.fromTimestamp * 1000}&end_ms=${options.toTimestamp * 1000}&referral_code=dream`);
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

async function fetchSts(options: FetchOptions) {
  const { feesUsd, referralSharedUsd } = await fetchDreamDailyStats(options);
  const fees = Number(feesUsd);
  const referralPayouts = Number(referralSharedUsd);

  const dailyFees = options.createBalances();
  dailyFees.addUSDValue(fees, OPTION_TRADING_FEES);

  const dailySupplySideRevenue = options.createBalances();
  dailySupplySideRevenue.addUSDValue(referralPayouts, REFERRAL_PAYOUTS);

  const dailyRevenue = options.createBalances();
  dailyRevenue.addUSDValue(fees - referralPayouts, OPTION_TRADING_FEES);

  return {
    dailyFees,
    dailyUserFees: dailyFees.clone(1, OPTION_TRADING_FEES),
    dailySupplySideRevenue,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue.clone(1, OPTION_TRADING_FEES),
  }
}

const adapter: SimpleAdapter = {
  version: 1, // Dream's API serves one finished UTC day per call
  adapter: {
    [CHAIN.LYRA]: { fetch: fetchBuilderReferrals, start: '2025-11-29', deadFrom: '2026-10-06' }, // that venue's chain shut down with its v3 cutover
    [CHAIN.OFF_CHAIN]: { fetch: fetchSts, start: '2026-08-17' },
  },
  methodology: {
    Fees: "Opening fees from Dream's RFQ-based brokerage, plus historical builder fees and referral rewards earned by Dream.",
    UserFees: "Trading fees paid by users when opening options positions through Dream's RFQ-based brokerage.",
    SupplySideRevenue: 'Share of trading fees distributed to referral partners.',
    Revenue: 'Brokerage opening fees less referral partner allocations, plus historical builder fees and referral rewards earned by Dream.',
    ProtocolRevenue: 'Brokerage opening fees less referral partner allocations, plus historical builder fees and referral rewards earned by Dream.',
  },
  breakdownMethodology: {
    Fees: {
      [BUILDER_REFERRAL_FEES]: 'Historical builder fees and referral rewards earned by Dream; series ended 2026-10-06.',
      [OPTION_TRADING_FEES]: "Trading fees charged on opens at Dream's RFQ-based brokerage, cash-settled in USDC on Solana.",
    },
    UserFees: {
      [OPTION_TRADING_FEES]: 'Trading fees paid by users on opens.',
    },
    SupplySideRevenue: {
      [REFERRAL_PAYOUTS]: 'Share of trading fees distributed to referral partners.',
    },
    Revenue: {
      [BUILDER_REFERRAL_FEES]: 'Historical builder fees and referral rewards, all earned by Dream.',
      [OPTION_TRADING_FEES]: 'Trading fees after referral payouts.',
    },
    ProtocolRevenue: {
      [BUILDER_REFERRAL_FEES]: 'Historical builder fees and referral rewards, all earned by Dream.',
      [OPTION_TRADING_FEES]: 'Trading fees after referral payouts.',
    },
  },
}

export default adapter;
