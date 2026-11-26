import { FetchOptions, SimpleAdapter } from '../adapters/types';
import { prefetchWalletVRelay, walletVRelayChainConfig, walletVRelayMetrics } from '../helpers/wallet-v-relay';

async function fetch(options: FetchOptions) {
  const dailyBridgeVolume = options.createBalances();
  dailyBridgeVolume.addUSDValue(walletVRelayMetrics(options).volumeUsd, { id: 'wallet-v-relay' });
  return { dailyBridgeVolume };
}

const adapter: SimpleAdapter = {
  version: 1,
  adapter: walletVRelayChainConfig(),
  prefetch: prefetchWalletVRelay,
  fetch,
  doublecounted: true,
  methodology: {
    Volume: 'Actual USD value of the input for each successful cross-chain request routed through Relay by Wallet V. The Wallet V daily API counts each request once on its source chain and UTC creation date, including cross-chain withdrawals.',
  },
};

export default adapter;
