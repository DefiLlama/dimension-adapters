import { Dependencies, FetchOptions, SimpleAdapter } from '../adapters/types';
import { bridgeChains } from '../helpers/aggregators/wallet-v/config';
import { addAmount } from '../helpers/aggregators/wallet-v/evm-data';
import { readRangoBridge } from '../helpers/aggregators/wallet-v/rango-bridges';

async function fetch(options: FetchOptions) {
  const dailyBridgeVolume = options.createBalances();
  for (const principal of await readRangoBridge(options, 'volume')) addAmount(dailyBridgeVolume, principal);
  return { dailyBridgeVolume };
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  adapter: bridgeChains,
  dependencies: [Dependencies.ALLIUM],
  doublecounted: true, // Across and Mayan can report the same routed principal.
  fetch,
  methodology: {
    Volume: 'Principal deposited into Across from Optimism to Arbitrum and Mayan Swift from Ethereum to Solana through Wallet V, credited to the source chain when the transfer completes.',
  },
};

export default adapter;
