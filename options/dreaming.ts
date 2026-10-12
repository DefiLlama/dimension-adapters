import { FetchOptions, SimpleAdapter } from '../adapters/types';
import { CHAIN } from '../helpers/chains';
import { fetchDreamDailyStats } from '../fees/dreaming';

// Dream's RFQ-based brokerage executes off-chain; Solana only carries the USDC settlement, so off_chain like fees/kyan.ts
const fetch = async (options: FetchOptions) => {
  const { notionalUsd, premiumUsd } = await fetchDreamDailyStats(options);
  return {
    dailyNotionalVolume: notionalUsd,
    dailyPremiumVolume: premiumUsd,
  }
}

const adapter: SimpleAdapter = {
  version: 1, // Dream's API serves one finished UTC day per call
  fetch,
  start: '2026-08-17',
  chains: [CHAIN.OFF_CHAIN],
  methodology: {
    NotionalVolume: 'Sum of the notional value of all options that have been traded on the exchange',
    PremiumVolume: 'Sum of value paid buying and selling options on the exchange',
  },
}

export default adapter;
