const endpoint = 'https://exchange-api.evedex.com/api/external/cmc/v1/contracts'
import type { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import fetchURL from "../utils/fetchURL";
import { sleep } from "../utils/utils";

const fetch = async (_options: FetchOptions) => {
  const { markets } = await fetchURL('https://zo-mainnet.n1.xyz/info');

  let openInterestAtEnd = 0
  let dailyVolume = 0
  for (const market of markets) {
    if (!market.symbol.endsWith('USD')) continue;
    await sleep(200); // to avoid rate limits
    const { volumeQuote24h, indexPrice, perpStats: { open_interest }} = await fetchURL(`https://zo-mainnet.n1.xyz/market/${market.marketId}/stats`);
    openInterestAtEnd += open_interest * indexPrice;
    dailyVolume += volumeQuote24h;
  }

  return { openInterestAtEnd, dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.N1]: {
      fetch,
      runAtCurrTime: true,
    },
  },
};

export default adapter;
