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
    NotionalVolume: 'Dream Options - Total USD notional value of options contracts traded through Dream, including positions opened and closed. Each executed transaction is counted once.',
    PremiumVolume: 'Dream Options - Total USD value of options premiums paid on executed opening and closing transactions, excluding brokerage fees.',
  },
}

export default adapter;
