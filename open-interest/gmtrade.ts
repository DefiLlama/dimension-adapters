import { SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getEnv } from "../helpers/env";
import fetchURL from "../utils/fetchURL";

const URL = getEnv('GMTRADE_PAIRS_URL')

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
