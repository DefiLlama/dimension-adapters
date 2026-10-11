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
    NotionalVolume: 'USD notional of executed opens and manual closes, counted once per execution; expiry settlements are excluded. Uses trade-time underlying prices where available, historical price estimates for backfilled trades, and strike prices when no underlying price is available. Includes the API\'s verified and estimated notional components.',
    PremiumVolume: 'Total USD value of options premiums paid or received on executed opens and manual closes, excluding brokerage fees and expiry settlement payouts.',
  },
}

export default adapter;
