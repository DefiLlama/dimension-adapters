import { FetchOptions, SimpleAdapter } from '../../adapters/types';
import { CHAIN } from '../../helpers/chains';
import { getPeachAmounts, launchpadStart } from '../../helpers/peach';

export const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  for (const row of await getPeachAmounts(options, 'launchpad')) {
    // Graduated pools settle on the receiving DEX and belong to its volume listing.
    if (row.source === 'bonding') dailyVolume.addUSDValue(Number(row.volume_usd));
  }
  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  chains: [CHAIN.ARC],
  start: launchpadStart,
  fetch,
  methodology: {
    Volume: 'Value of user trades on Peach bonding curves. Excludes swaps on graduated pools, which are tracked as separate DEX volume, plus buybacks, liquidity operations and trades without a USD price.',
  },
};

export default adapter;
