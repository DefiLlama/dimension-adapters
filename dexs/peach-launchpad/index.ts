import { FetchOptions, SimpleAdapter } from '../../adapters/types';
import { CHAIN } from '../../helpers/chains';
import { getPeachAmounts, launchpadStart } from '../../helpers/peach';

export const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  // The API reconciles these rows to total volume. Hook trades are already
  // included in legacy bonding rows; do not add volume_breakdown again.
  for (const row of await getPeachAmounts(options, 'launchpad')) {
    dailyVolume.addUSDValue(Number(row.volume_usd));
  }
  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  // Hook pool trades are also counted by Uniswap v4.
  doublecounted: true,
  chains: [CHAIN.ARC],
  start: launchpadStart,
  fetch,
  methodology: {
    Volume: 'Value of user trades in Peach bonding curves and corresponding hooks.',
  },
};

export default adapter;
