import optionsAdapter, { fetchTrading } from '../options/stryke-rfq';
import { FetchOptions, SimpleAdapter } from '../adapters/types';

const adapter: SimpleAdapter = {
  ...optionsAdapter,
  fetch: async (options: FetchOptions) => {
    const { dailyFees, dailyRevenue } = await fetchTrading(options);
    return { dailyFees, dailyRevenue };
  },
  methodology: {
    Fees: optionsAdapter.methodology!.Fees,
    Revenue: optionsAdapter.methodology!.Revenue,
  },
  breakdownMethodology: {
    Fees: optionsAdapter.breakdownMethodology!.Fees,
    Revenue: optionsAdapter.breakdownMethodology!.Revenue,
  },
};

export default adapter;
