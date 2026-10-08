import { FetchOptions, SimpleAdapter } from '../adapters/types';
import { CHAIN } from '../helpers/chains';
import { getDeriveBuilderFees } from '../helpers/derive';

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch: async function (options: FetchOptions) {
    const fees = await getDeriveBuilderFees('dream', options);
    return {
      dailyFees: fees,
      dailyRevenue: fees,
      dailyProtocolRevenue: fees,
    }
  },
  start: '2025-11-29',
  chains: [CHAIN.LYRA],
  methodology: {
    Fees: 'Total referral fees shared from Derive.',
    Revenue: 'All fees are revenue to Dreaming.',
    ProtocolRevenue: 'All fees are revenue to Dreaming.',
  },
}

export default adapter;
