import { SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import fetchURL from "../utils/fetchURL";

// GMX's official GMX Solana pair feed (gmx-api), the same CoinGecko-format rows as the legacy GMTrade market-info feed it replaces
const URL = "https://solana.gmxapi.io/v1/pairs";

const fetch = async (_a: any) => {
  const pairs = await fetchURL(URL)

  let longOpenInterestAtEnd = 0
  let shortOpenInterestAtEnd = 0

  for (const pair of pairs) {
    if (pair.product_type !== 'Perpetual') continue
    longOpenInterestAtEnd += Number(pair.long_open_interest || 0)
    shortOpenInterestAtEnd += Number(pair.short_open_interest || 0)
  }

  return {
    longOpenInterestAtEnd,
    shortOpenInterestAtEnd,
    // Pool venue, as in gmx-v2: every position is its own contract against the pool (longs and shorts are not
    // matched against each other), so long + short counts each open position exactly once.
    openInterestAtEnd: longOpenInterestAtEnd + shortOpenInterestAtEnd,
  }
}

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.SOLANA],
  runAtCurrTime: true,
}

export default adapter;
