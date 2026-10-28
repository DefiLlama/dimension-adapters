import { FetchOptions, SimpleAdapter } from '../../adapters/types';
import { CHAIN } from '../../helpers/chains';
import { getPeachAmounts, launchpadStart } from '../../helpers/peach';

export const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  for (const row of await getPeachAmounts(options, 'launchpad')) {
    // buyback_usd is the trading-fee budget allocated to launched tokens,
    // not a card redemption or refund of the user's fee. It remains in gross
    // fees and is allocated to supply-side revenue when the fee accrues.
    // Later buyback_releases are excluded to avoid counting the fee twice.
    dailyFees.addUSDValue(Number(row.fees_usd), row.source === 'bonding' ? 'Bonding trading fees' : 'Graduated pool allocations', { id: 'peach-launchpad' });
    dailyRevenue.addUSDValue(Number(row.revenue_usd), 'Platform allocations', { id: 'peach-launchpad' });
    dailySupplySideRevenue.addUSDValue(Number(row.creator_usd), 'Creator allocations', { id: 'peach-launchpad' });
    dailySupplySideRevenue.addUSDValue(Number(row.partner_usd), 'Partner allocations', { id: 'peach-launchpad' });
    dailySupplySideRevenue.addUSDValue(Number(row.referrer_usd), 'Referral allocations', { id: 'peach-launchpad' });
    dailySupplySideRevenue.addUSDValue(Number(row.buyback_usd), 'Launched-token buyback budgets', { id: 'peach-launchpad' });
  }
  return { dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue.clone(), dailySupplySideRevenue };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  chains: [CHAIN.ARC],
  start: launchpadStart,
  fetch,
  methodology: {
    Fees: 'Trading fees from Peach bonding-curve trades and the launchpad\'s cut of graduated-pool LP fees, including creator tax, counted once when the fee accrues. Fees without a USD price are excluded.',
    Revenue: 'The platform\'s own share of fees, after creator, partner, referral and launched-token buyback shares.',
    ProtocolRevenue: 'Same as Revenue - all of it goes to the protocol.',
    SupplySideRevenue: 'Creator, partner and referral shares of fees, plus the share allocated to launched-token buybacks. These launched tokens are not the Peach governance token.',
  },
  breakdownMethodology: {
    Fees: {
      'Bonding trading fees': 'The total_fee amount of canonical BONDING allocations, including the recorded base, protection and creator fees.',
      'Graduated pool allocations': 'The total_fee amount of canonical LP allocations. This is the launchpad allocation, not every third-party LP fee in the whole pool.',
    },
    Revenue: { 'Platform allocations': 'The recorded platform_amount (platformNet/protocolNet) after the event-specific split.' },
    ProtocolRevenue: { 'Platform allocations': 'The recorded net platform allocation.' },
    SupplySideRevenue: {
      'Creator allocations': 'Creator amount including creator tax and any routing to a launched-token holder distributor.',
      'Partner allocations': 'Partner amount from each allocation event.',
      'Referral allocations': 'Referrer amount from each allocation event.',
      'Launched-token buyback budgets': 'Share of collected trading fees allocated to launched-token buybacks at accrual; included in gross fees and supply-side revenue. Subsequent releases are excluded. These launched tokens are not the launchpad governance token.',
    },
  },
};

export default adapter;
