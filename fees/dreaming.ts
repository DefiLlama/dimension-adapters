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
    Fees: 'Share of Derive trading fees paid out to Dream for the traders it referred, plus builder fees Dream set on the orders it submitted.',
    Revenue: 'All referral fee share and builder fees paid out to Dream are kept by Dream.',
    ProtocolRevenue: 'All referral fee share and builder fees paid out to Dream are kept by Dream.',
  },
}

export default adapter;
