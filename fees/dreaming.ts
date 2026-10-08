import { FetchOptions, SimpleAdapter } from '../adapters/types';
import { getDeriveBuilderData } from '../fees/lyra-v2';
import { CHAIN } from '../helpers/chains';
import fetchURL from '../utils/fetchURL';

// Dream's public daily stats, one finished UTC day per call, shared with options/dreaming.ts
export const fetchDreamDailyStats = (options: FetchOptions) =>
  fetchURL(`https://api.dos.app/public/defillama/daily?date=${options.dateString}`);

const DERIVE_REFERRAL_FEES = 'Derive Builder Referral Fees';
const OPTION_TRADING_FEES = 'Option Trading Fees';
const REFERRAL_PAYOUTS = 'Referral Payouts';

// Dream ran on Derive (lyra) until 2026-08-17, then moved to its own OTC desk with STS Digital (off_chain)
async function fetchDerive(options: FetchOptions) {
  const { fees } = await getDeriveBuilderData('dream', options.fromTimestamp, options.toTimestamp);

  const dailyFees = options.createBalances();
  dailyFees.addUSDValue(Number(fees), DERIVE_REFERRAL_FEES);

  return {
    dailyFees,
    dailyRevenue: dailyFees.clone(1, DERIVE_REFERRAL_FEES),
    dailyProtocolRevenue: dailyFees.clone(1, DERIVE_REFERRAL_FEES),
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
    [CHAIN.LYRA]: { fetch: fetchDerive, start: '2025-11-29', deadFrom: '2026-10-06' }, // Derive Chain shut down with the v3 cutover
    [CHAIN.OFF_CHAIN]: { fetch: fetchSts, start: '2026-08-17' },
  },
  methodology: {
    Fees: "Referral fees shared by Derive while Dream traded there (until 2026-10-06), and the 2% of option premium Dream charges on opens at its own OTC desk since 2026-08-17.",
    UserFees: "2% of option premium charged by Dream on opens at its own OTC desk.",
    SupplySideRevenue: 'Share of option trading fees paid out to referrers.',
    Revenue: 'Trading fees minus referral payouts.',
    ProtocolRevenue: 'Trading fees minus referral payouts.',
  },
  breakdownMethodology: {
    Fees: {
      [DERIVE_REFERRAL_FEES]: 'Referral fees shared by Derive to Dream as a builder.',
      [OPTION_TRADING_FEES]: "2% of option premium charged by Dream on opens, executed OTC with STS Digital and cash-settled in USDC on Solana.",
    },
    UserFees: {
      [OPTION_TRADING_FEES]: "2% of option premium charged by Dream on opens.",
    },
    SupplySideRevenue: {
      [REFERRAL_PAYOUTS]: 'Share of option trading fees paid out to referrers.',
    },
    Revenue: {
      [DERIVE_REFERRAL_FEES]: 'Derive referral fees, all kept by Dream.',
      [OPTION_TRADING_FEES]: 'Option trading fees after referral payouts.',
    },
    ProtocolRevenue: {
      [DERIVE_REFERRAL_FEES]: 'Derive referral fees, all kept by Dream.',
      [OPTION_TRADING_FEES]: 'Option trading fees after referral payouts.',
    },
  },
}

export default adapter;
