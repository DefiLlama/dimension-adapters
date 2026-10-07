import { FetchOptions, SimpleAdapter } from '../../adapters/types';
import { CHAIN } from '../../helpers/chains';
import { fetchDreamDailyStats } from '../../helpers/dream';

// STS is a central, off-exchange order book; Solana only carries the cash deposits and
// withdrawals settling these trades, not the execution itself, so this is classified off_chain
// rather than Solana - the same rule fees/kyan.ts and fees/apollox/index.ts use for their own
// off-chain venues. No pre-migration history to preserve here (unlike fees/dreaming.ts): this
// adapter is new, and STS is the only source it has ever had.
const adapter: SimpleAdapter = {
  version: 1,
  fetch: async function (options: FetchOptions) {
    const { notionalVerifiedUsd, premiumUsd } = await fetchDreamDailyStats(options);
    return {
      dailyNotionalVolume: notionalVerifiedUsd,
      dailyPremiumVolume: premiumUsd,
    }
  },
  start: '2026-08-17',
  chains: [CHAIN.OFF_CHAIN],
  methodology: {
    NotionalVolume: "quantity x the underlying price carried on the executed STS quote (or the accepted-quote record for backfilled history), opens and manual closes, USD; rows without quote evidence are excluded until evidence is loaded; each counted row carries its STS execution/quote audit id in Dream's ledger",
    PremiumVolume: 'premium paid on opens plus premium received on manual closes, USD',
  },
}

export default adapter;
