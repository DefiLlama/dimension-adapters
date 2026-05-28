import type { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import fetchURL from "../utils/fetchURL";
import { sleep } from "../utils/utils";

const fetch = async (_options: FetchOptions) => {
  const { markets } = await fetchURL('https://zo-mainnet.n1.xyz/info');

  let dailyVolume = 0
  for (const market of markets) {
    if (!market.symbol.endsWith('USD')) continue;
    await sleep(200); // to avoid rate limits
    const { volumeQuote24h } = await fetchURL(`https://zo-mainnet.n1.xyz/market/${market.marketId}/stats`);
    dailyVolume += volumeQuote24h;
  }

  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.N1]: {
      fetch,
      runAtCurrTime: true,
    },
  },
  methodology: {
    Volume: "Sum of 24h quote volume across all quoted perpetual markets",
  },
};

export default adapter;
