import { FetchOptions, SimpleAdapter } from '../adapters/types';
import { getDeriveBuilderData } from '../fees/lyra-v2';
import { CHAIN } from '../helpers/chains';
import { fetchDreamDailyStats } from '../helpers/dream';

// Breakdown labels name the economic flow behind each balance, not the venue it ran on. They are
// the `breakdownMethodology` keys below AND the label every `addUSDValue`/`clone` call tags its
// amount with: DefiLlama's dashboard reads the per-label breakdown off the Balances object
// itself, so a `breakdownMethodology` entry with no matching labeled balance never renders.
const DERIVE_REFERRAL_FEES = 'Derive Builder Referral Fees';
const OPTION_TRADING_FEES = 'Option Trading Fees';
const REFERRAL_PAYOUTS = 'Referral Payouts';

// Dream's options desk ran on Derive (Lyra chain) until migrating to its own STS Digital OTC desk
// on 2026-08-17. Both sources stay side by side rather than cutting history at the migration
// date: Lyra keeps reading Derive's referral-fee data unchanged (fetchDerive, below), and the
// post-migration activity is reported separately under off_chain. STS is a central, off-exchange
// order book, and Solana only carries the cash deposits and withdrawals settling those trades,
// not the execution itself, the same off_chain rule fees/kyan.ts and fees/apollox/index.ts use
// for their own off-chain venues.
async function fetchDerive(options: FetchOptions) {
  const { fees } = await getDeriveBuilderData('dream', options.fromTimestamp, options.toTimestamp);

  const dailyFees = options.createBalances();
  dailyFees.addUSDValue(fees, DERIVE_REFERRAL_FEES);

  return {
    dailyFees,
    dailyRevenue: dailyFees.clone(1, DERIVE_REFERRAL_FEES),
    dailyProtocolRevenue: dailyFees.clone(1, DERIVE_REFERRAL_FEES),
  }
}

// The STS source has no data before the migration date. DefiLlama's runner asks every chain in
// `chains` for every UTC day since the adapter's `start` (2025-11-29, preserved for Lyra's sake),
// so the off_chain chain must answer something for the pre-migration days too: zero, not
// undefined. Undefined reads as "no data for this chain", whereas this chain's true answer for
// those days is "nothing happened here yet".
const STS_SOURCE_START_DATE = '2026-08-17';

async function fetchSts(options: FetchOptions) {
  if (options.dateString < STS_SOURCE_START_DATE) {
    const zeroFees = options.createBalances()
    zeroFees.addUSDValue(0, OPTION_TRADING_FEES)
    const zeroPayouts = options.createBalances()
    zeroPayouts.addUSDValue(0, REFERRAL_PAYOUTS)

    return {
      dailyFees: zeroFees,
      dailyUserFees: zeroFees.clone(1, OPTION_TRADING_FEES),
      dailySupplySideRevenue: zeroPayouts,
      dailyRevenue: zeroFees.clone(1, OPTION_TRADING_FEES),
      dailyProtocolRevenue: zeroFees.clone(1, OPTION_TRADING_FEES),
    }
  }

  const { feesUsd, referralSharedUsd } = await fetchDreamDailyStats(options);
  const fees = Number(feesUsd);
  const referralPayouts = Number(referralSharedUsd);

  const dailyFees = options.createBalances();
  dailyFees.addUSDValue(fees, OPTION_TRADING_FEES);

  const dailySupplySideRevenue = options.createBalances();
  dailySupplySideRevenue.addUSDValue(referralPayouts, REFERRAL_PAYOUTS);

  // Derived here rather than read off the response so fees = revenue + supply-side revenue holds
  // by construction, whatever the upstream sends.
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
  version: 1,
  // Also the default/off_chain fetch, kept at the top level because adapter test tooling reads
  // `.fetch` directly off the default export; adapterObject below still carries its own reference
  // to the exact same function for the real per-chain run.
  fetch: fetchSts,
  start: '2025-11-29',
  chains: [CHAIN.LYRA, CHAIN.OFF_CHAIN],
  adapter: {
    [CHAIN.LYRA]: { fetch: fetchDerive, start: '2025-11-29' },
    [CHAIN.OFF_CHAIN]: { fetch: fetchSts, start: '2025-11-29' },
  },
  methodology: {
    Fees: "Lyra chain: referral fees shared by Derive to Dream as a builder (Derive era, until 2026-08-17). off_chain: 2% of option premium charged by Dream's own brokerage on opens, executed OTC with STS Digital, cash-settled in USDC on Solana.",
    UserFees: "off_chain only: 2% of option premium charged by Dream's own brokerage on opens. The Derive-era leg did not report user fees.",
    SupplySideRevenue: 'off_chain only: share of option trading fees paid out to referrers. The Derive-era leg did not report a referral share.',
    Revenue: 'Fees minus referral payouts.',
    ProtocolRevenue: 'Fees minus referral payouts.',
  },
  breakdownMethodology: {
    Fees: {
      [DERIVE_REFERRAL_FEES]: 'Referral fees shared by Derive to Dream as a builder (Derive era, until 2026-08-17).',
      [OPTION_TRADING_FEES]:
        "2% of option premium charged by Dream's own brokerage on opens, executed OTC with STS Digital, cash-settled in USDC on Solana.",
    },
    UserFees: {
      [OPTION_TRADING_FEES]:
        "2% of option premium charged by Dream's own brokerage on opens, executed OTC with STS Digital, cash-settled in USDC on Solana.",
    },
    SupplySideRevenue: {
      [REFERRAL_PAYOUTS]: 'Share of option trading fees paid out to referrers.',
    },
    Revenue: {
      [DERIVE_REFERRAL_FEES]: 'All Derive-era referral fees were retained as revenue; no referral share was tracked for this leg.',
      [OPTION_TRADING_FEES]: 'Option trading fees retained after referral payouts.',
    },
    ProtocolRevenue: {
      [DERIVE_REFERRAL_FEES]: 'All Derive-era referral fees were retained as revenue; no referral share was tracked for this leg.',
      [OPTION_TRADING_FEES]: 'Option trading fees retained after referral payouts.',
    },
  },
}

export default adapter;
