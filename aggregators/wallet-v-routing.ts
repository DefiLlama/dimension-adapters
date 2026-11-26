import { Dependencies, FetchOptions, SimpleAdapter } from '../adapters/types';
import { addToken, chainConfig, fetchWalletV } from '../helpers/aggregators/wallet-v';

async function fetch(options: FetchOptions) {
  const dailyVolume = options.createBalances();
  for (const { kind, token, amount } of await fetchWalletV(options)) {
    if (kind === 'volume') addToken(dailyVolume, token, amount);
  }
  return { dailyVolume };
}

const adapter: SimpleAdapter = {
  // Allium lags behind the hourly run, so its readiness check fails nearly every hour
  version: 1,
  adapter: chainConfig,
  dependencies: [Dependencies.ALLIUM],
  doublecounted: true,
  fetch,
  methodology: {
    Volume: 'Input amount of swaps that paid Wallet V its service fee, routed through 1inch, OKX, KyberSwap, Jupiter and other aggregators. Each transaction counts once.',
  },
};

export default adapter;
