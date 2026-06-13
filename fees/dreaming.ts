import { FetchOptions, SimpleAdapter } from '../adapters/types';
import { getDeriveBuilderData } from '../fees/lyra-v2';
import { CHAIN } from '../helpers/chains';

const adapter: SimpleAdapter = {
  version: 2,
  fetch: async function (options: FetchOptions) {
    const { fees } = await getDeriveBuilderData('dream', options.fromTimestamp, options.toTimestamp);
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
