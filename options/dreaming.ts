import { FetchOptions, SimpleAdapter } from '../adapters/types';
import { CHAIN } from '../helpers/chains';
import { fetchDreamDailyStats } from '../fees/dreaming';

// Dream trades OTC with STS Digital, Solana only carries the USDC settlement, so off_chain like fees/kyan.ts
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
    NotionalVolume: "Contracts times the underlying price for options opened and closed at Dream's OTC desk.",
    PremiumVolume: "Premium paid on opens plus premium received on closes at Dream's OTC desk.",
  },
}

export default adapter;
