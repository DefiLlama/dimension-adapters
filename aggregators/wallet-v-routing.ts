import { Dependencies, FetchOptions, SimpleAdapter } from '../adapters/types';
import { chainConfig } from '../helpers/aggregators/wallet-v/config';
import { addAmount } from '../helpers/aggregators/wallet-v/evm-data';
import { readEvmSwaps } from '../helpers/aggregators/wallet-v/evm-swaps';
import { readSolanaSwaps } from '../helpers/aggregators/wallet-v/solana-swaps';

async function fetch(options: FetchOptions) {
  const config = chainConfig[options.chain];
  const swaps = 'classic' in config ? await readEvmSwaps(options, config) : await readSolanaSwaps(options, config);
  const dailyVolume = options.createBalances();
  for (const { volume } of swaps) {
    if (volume) addAmount(dailyVolume, volume);
  }
  return { dailyVolume };
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  adapter: chainConfig,
  dependencies: [Dependencies.ALLIUM],
  doublecounted: true, // Routed trades are also reported by the underlying venues.
  fetch,
  methodology: {
    Volume: 'Input paid for successful same-chain swaps identifiable by Wallet V’s on-chain service fee, including that fee and net of refunds.',
  },
};

export default adapter;
