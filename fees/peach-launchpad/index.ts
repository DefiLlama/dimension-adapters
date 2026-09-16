import { FetchOptions, SimpleAdapter } from '../../adapters/types';
import { CHAIN } from '../../helpers/chains';
import { getPeachAmounts, launchpadStart } from '../../helpers/peach';

export const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  for (const row of await getPeachAmounts(options, 'launchpad')) {
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
    Fees: 'Backend USD valuation of actual BONDING and LP fee allocations recorded on chain: USDC at dashboard parity, token fees at their unambiguous canonical swap execution rate; including creator tax when present. Allocations are counted once at accrual, never again at claim.',
    Revenue: 'Net platform amount recorded in those fee allocations. Deferred buyback-token releases are disclosed separately by the API and excluded from this metric.',
    ProtocolRevenue: 'Same net platform allocations as Revenue; no claim-time double counting.',
    SupplySideRevenue: 'Creator, partner, referral and launched-token buyback allocations. Launched tokens are not the launchpad governance token.',
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
      'Launched-token buyback budgets': 'Budget allocated to launched-token buybacks; not launchpad governance-token holders revenue. Subsequent releases must not be counted a second time as fees.',
    },
  },
};

export default adapter;
