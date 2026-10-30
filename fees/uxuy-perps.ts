import { FetchOptions, SimpleAdapter } from '../adapters/types';
import { CHAIN } from '../helpers/chains';
import { getFeeAmounts, getMetrics } from '../helpers/uxuy-perps';

const fetch = async (options: FetchOptions) => {
  const amounts = getFeeAmounts(await getMetrics(options));
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  dailyFees.addUSDValue(amounts.fees, 'Open/Close Fees');
  dailyRevenue.addUSDValue(amounts.revenue, 'Open/Close Fees To Protocol');
  dailySupplySideRevenue.addUSDValue(amounts.commission, 'Open/Close Fees To Referrers');
  // The API does not expose treasury/tokenholder allocations; do not invent that optional split.
  return { dailyFees, dailyRevenue, dailySupplySideRevenue };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  chains: [CHAIN.OFF_CHAIN],
  fetch,
  methodology: {
    Fees: 'Opening and closing trading fees on UXUY self-operated perps, excluding extra liquidation fees, attributed by order update time. USDT and UUSD use the venue\'s 1:1 USD accounting convention.',
    Revenue: 'Opening and closing fees less actual referral commissions.',
    SupplySideRevenue: 'Actual referral commissions deducted from opening and closing fees.',
  },
  breakdownMethodology: {
    Fees: { 'Open/Close Fees': 'Trading fees for opening and closing positions; extra liquidation fees are excluded.' },
    Revenue: { 'Open/Close Fees To Protocol': 'Opening and closing fees retained after actual referral commissions.' },
    SupplySideRevenue: { 'Open/Close Fees To Referrers': 'Actual commissions allocated to referrers.' },
  },
};

export default adapter;
