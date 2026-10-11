import { FetchOptions, SimpleAdapter } from '../adapters/types';
import { getDeriveBuilderData } from '../fees/lyra-v2';
import { CHAIN } from '../helpers/chains';
import fetchURL from '../utils/fetchURL';

// Dream's public daily stats, one finished UTC day per call, shared with options/dreaming.ts
export const fetchDreamDailyStats = (options: FetchOptions) =>
  fetchURL(`https://api.dos.app/public/defillama/daily?date=${options.dateString}`);

const BUILDER_REFERRAL_FEES = 'Builder Referral Fees';
const OPTION_TRADING_FEES = 'Option Trading Fees';
const REFERRAL_PAYOUTS = 'Referral Payouts';

// Dream routed options to a third-party venue until 2026-08-17, then moved to its own RFQ-based brokerage (off_chain)
async function fetchBuilderReferrals(options: FetchOptions) {
  const { fees } = await getDeriveBuilderData('dream', options.fromTimestamp, options.toTimestamp);

  const dailyFees = options.createBalances();
  dailyFees.addUSDValue(Number(fees), BUILDER_REFERRAL_FEES);

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
    Fees: "Trading fees paid by users when opening options positions through Dream's RFQ-based brokerage.",
    UserFees: "Trading fees paid by users when opening options positions through Dream's RFQ-based brokerage.",
    SupplySideRevenue: 'Share of trading fees distributed to referral partners.',
    Revenue: "Dream's share of trading fees collected from options transactions, excluding fees distributed to referral partners.",
    ProtocolRevenue: "Dream's share of trading fees collected from options transactions, excluding fees distributed to referral partners.",
  },
  breakdownMethodology: {
    Fees: {
      [BUILDER_REFERRAL_FEES]: 'Referral fee share Dream earned as a builder on a third-party venue before its own brokerage launched; ended 2026-10-06.',
      [OPTION_TRADING_FEES]: "Trading fees charged on opens at Dream's RFQ-based brokerage, cash-settled in USDC on Solana.",
    },
    UserFees: {
      [OPTION_TRADING_FEES]: 'Trading fees paid by users on opens.',
    },
    SupplySideRevenue: {
      [REFERRAL_PAYOUTS]: 'Share of trading fees distributed to referral partners.',
    },
    Revenue: {
      [BUILDER_REFERRAL_FEES]: 'Builder referral fee share, all kept by Dream.',
      [OPTION_TRADING_FEES]: 'Trading fees after referral payouts.',
    },
    ProtocolRevenue: {
      [BUILDER_REFERRAL_FEES]: 'Builder referral fee share, all kept by Dream.',
      [OPTION_TRADING_FEES]: 'Trading fees after referral payouts.',
    },
  },
}

export default adapter;
